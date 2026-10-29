import json


def cpp_files(meta, data):
    def literal(value): return json.dumps(value, ensure_ascii=False)
    tensors = meta["tensors"]
    declarations = []
    if meta["family"] == "trees":
        for i, tree in enumerate(meta["trees"]):
            for key in ("left", "right", "feature"):
                declarations.append(f'static const int {key}_{i}[] = {{{", ".join(map(str, tree[key]))}}};')
    chunks = [', '.join(f'0x{byte:02x}' for byte in data[i:i + 16]) for i in range(0, len(data), 16)]
    header = f'''#pragma once
// Generated native model. Storage: {meta["storage"]}; arithmetic: Float32.
#include <cstddef>
constexpr int MODEL_INPUT_COUNT = {len(meta["inputColumns"])};
constexpr int MODEL_OUTPUT_COUNT = {meta["outputCount"]};
constexpr int MODEL_CLASS_COUNT = {len(meta["classes"])};
constexpr int MODEL_WORKSPACE_ESTIMATE = {meta["workspaceBytesEstimate"]};
bool model_predict(const float* raw_inputs, float* outputs);
int model_class_index(const float* outputs);
const char* model_class_label(int index);
'''
    source = '''#include "model.h"
#include <cmath>
#include <cstring>
#include <algorithm>
#include <cstdint>
'''
    source += 'alignas(4) static const unsigned char weights[] = {\n' + ',\n'.join(chunks) + '\n};\n'
    if meta["storage"] == "float16":
        source += '''static float value(int index) {
    unsigned int h = weights[2*index] | (static_cast<unsigned int>(weights[2*index+1]) << 8);
    const int sign = (h & 0x8000) ? -1 : 1;
    const unsigned int exponent = (h >> 10) & 31, fraction = h & 1023;
    if (!exponent) return sign * std::ldexp(static_cast<float>(fraction), -24);
    return sign * std::ldexp(1.0f + static_cast<float>(fraction)/1024.0f, static_cast<int>(exponent)-15);
}
'''
    else:
        source += '''static float value(int index) {
    uint32_t bits = uint32_t(weights[4*index]) | (uint32_t(weights[4*index+1]) << 8) | (uint32_t(weights[4*index+2]) << 16) | (uint32_t(weights[4*index+3]) << 24);
    float result; std::memcpy(&result, &bits, sizeof(result)); return result;
}
'''
    source += '\n'.join(declarations) + '\n'
    source += 'static const char* labels[] = {' + ', '.join(literal(label) for label in meta["classes"]) + ('' if meta["classes"] else '""') + '};\n'
    source += 'const char* model_class_label(int index) { return index >= 0 && index < MODEL_CLASS_COUNT ? labels[index] : ""; }\n'
    source += '''int model_class_index(const float* outputs) {
    if (!MODEL_CLASS_COUNT) return -1;
    if (MODEL_OUTPUT_COUNT == 1) return outputs[0] > 0.5f ? 1 : 0;
    int best=0; for(int i=1; i<MODEL_OUTPUT_COUNT; ++i) if(outputs[i]>outputs[best]) best=i; return best;
}
'''
    width = max([len(meta["inputColumns"]), meta["outputCount"]] + [layer["outputs"] for layer in meta["layers"]])
    source += f'''bool model_predict(const float* raw_inputs, float* outputs) {{
    float a[{width}] = {{0}}, b[{width}] = {{0}};
    for(int i=0; i<MODEL_INPUT_COUNT; ++i) {{
        if(!std::isfinite(raw_inputs[i])) return false;
        a[i] = raw_inputs[i] * value({tensors["scale"]["offset"]}+i) + value({tensors["offset"]["offset"]}+i);
        if(!std::isfinite(a[i])) return false;
    }}
'''
    if meta["family"] == "dense":
        for i, layer in enumerate(meta["layers"]):
            inputs, outputs = layer["inputs"], layer["outputs"]
            source += f'''    for(int j=0;j<{outputs};++j) {{
        float sum=value({tensors[f"bias_{i}"]["offset"]}+j);
        for(int k=0;k<{inputs};++k) sum += a[k]*value({tensors[f"weight_{i}"]["offset"]}+k*{outputs}+j);
        b[j]=sum;
    }}
'''
            if layer["activation"] == "relu": source += f'    for(int j=0;j<{outputs};++j) b[j]=std::max(0.0f,b[j]);\n'
            elif layer["activation"] == "tanh": source += f'    for(int j=0;j<{outputs};++j) b[j]=std::tanh(b[j]);\n'
            elif layer["activation"] == "logistic": source += f'    for(int j=0;j<{outputs};++j) {{ float x=b[j]; b[j]=x>=0 ? 1.0f/(1.0f+std::exp(-x)) : std::exp(x)/(1.0f+std::exp(x)); }}\n'
            elif layer["activation"] == "softmax": source += f'''    {{ float maximum=b[0], total=0; for(int j=1;j<{outputs};++j) maximum=std::max(maximum,b[j]);
      for(int j=0;j<{outputs};++j) {{ b[j]=std::exp(b[j]-maximum); total+=b[j]; }}
      for(int j=0;j<{outputs};++j) b[j]/=total; }}
'''
            source += f'    for(int j=0;j<{outputs};++j) a[j]=b[j];\n'
        source += '    for(int j=0;j<MODEL_OUTPUT_COUNT;++j) outputs[j]=a[j];\n'
    else:
        source += '    for(int j=0;j<MODEL_OUTPUT_COUNT;++j) outputs[j]=0;\n'
        for i, _ in enumerate(meta["trees"]):
            source += f'''    {{ int node=0;
      while(left_{i}[node]>=0) node = a[feature_{i}[node]] <= value({tensors[f"threshold_{i}"]["offset"]}+node) ? left_{i}[node] : right_{i}[node];
      for(int j=0;j<MODEL_OUTPUT_COUNT;++j) outputs[j]+=value({tensors[f"value_{i}"]["offset"]}+node*MODEL_OUTPUT_COUNT+j);
    }}
'''
        source += f'    for(int j=0;j<MODEL_OUTPUT_COUNT;++j) outputs[j]/={len(meta["trees"])}.0f;\n'
    source += '    for(int j=0;j<MODEL_OUTPUT_COUNT;++j) if(!std::isfinite(outputs[j])) return false;\n    return true;\n}\n'
    host = '''#include "model.h"
#include <cstdio>
#include <cstdlib>
int main(int argc, char** argv) {
    if(argc!=MODEL_INPUT_COUNT+1) { std::fprintf(stderr,"Pass one numeric argument per input column.\\n"); return 1; }
    float input[MODEL_INPUT_COUNT], output[MODEL_OUTPUT_COUNT];
    for(int i=0;i<MODEL_INPUT_COUNT;++i) { char* end=nullptr; input[i]=std::strtof(argv[i+1], &end); if(!end || *end) return 2; }
    if(!model_predict(input,output)) return 3;
    for(int j=0;j<MODEL_OUTPUT_COUNT;++j) std::printf("%s%.9g",j?" ":"",output[j]);
    std::printf("\\n"); return 0;
}
'''
    return {"model.h": header, "model.cpp": source, "host_test.cpp": host}


def firmware_files(meta, settings):
    board, interval = settings.board, settings.interval_ms
    columns = json.dumps(', '.join(meta["inputColumns"]), ensure_ascii=False)
    main = f'''#include "model.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <vector>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// Numeric CSV input through UART console; replace read/parse with your sensor driver later.
static void prediction_task(void*) {{
    std::vector<char> line(MODEL_INPUT_COUNT*40+80);
    std::printf("Input order: %s\\n", {columns});
    std::printf("Send one CSV row using the serial console at 115200 baud.\\n");
    while(true) {{
        if(!std::fgets(line.data(), static_cast<int>(line.size()), stdin)) {{ vTaskDelay(pdMS_TO_TICKS(20)); continue; }}
        float input[MODEL_INPUT_COUNT], output[MODEL_OUTPUT_COUNT];
        char* cursor=line.data(); bool valid=true;
        for(int i=0;i<MODEL_INPUT_COUNT;++i) {{
            char* end=nullptr; input[i]=std::strtof(cursor,&end);
            if(end==cursor || !std::isfinite(input[i])) {{ valid=false; break; }}
            cursor=end; while(*cursor==' ' || *cursor=='\\t') ++cursor;
            if(i<MODEL_INPUT_COUNT-1) {{ if(*cursor!=',') {{ valid=false; break; }} ++cursor; }}
        }}
        while(*cursor==' ' || *cursor=='\\r' || *cursor=='\\n') ++cursor;
        if(*cursor) valid=false;
        if(!valid || !model_predict(input,output)) {{ std::printf("Invalid numeric input row.\\n"); continue; }}
        if(MODEL_CLASS_COUNT) {{ int index=model_class_index(output); std::printf("class_index=%d label=%s\\n",index,model_class_label(index)); }}
        else std::printf("prediction=%.9g\\n",output[0]);
        vTaskDelay(pdMS_TO_TICKS({interval}));
    }}
}}
extern "C" void app_main(void) {{
    if(xTaskCreate(prediction_task, "prediction", MODEL_WORKSPACE_ESTIMATE + 16384, nullptr, 5, nullptr)!=pdPASS)
        std::printf("Not enough memory to start prediction task.\\n");
}}
'''
    readme = f'''FIRMWARE NGUỒN — ESP-IDF v5.4.2 — {board}

Gói này là dự án mã nguồn C++ native, chưa biên dịch/nạp/đo trên board.
Không dùng TensorFlow Lite, không có tensor arena. Float16 lưu tham số 16-bit và giải mã sang Float32 khi tính.

1. Cài ESP-IDF v5.4.2 và toolchain cho {board}:
https://docs.espressif.com/projects/esp-idf/en/v5.4.2/esp32/get-started/index.html
2. Mở ESP-IDF terminal, cd vào thư mục firmware này.
3. idf.py set-target {board}
4. idf.py build
5. idf.py -p COM_PORT flash monitor
Thay COM_PORT bằng cổng thật (Windows: COM5; Linux: /dev/ttyUSB0).

UART 115200 baud. Gửi từng dòng số, dấu phẩy phân cách, đúng thứ tự:
{', '.join(meta['inputColumns'])}
Chương trình chờ dữ liệu UART, dự đoán rồi nghỉ {interval} ms; chưa tự đọc cảm biến.
Để đọc cảm biến: sửa prediction_task/main.cpp, điền input[] đúng thứ tự/đơn vị và gọi model_predict.
Đã có tiền xử lý trong model.cpp; không chuẩn hóa thêm lần nữa.

model.cpp/model.h ở thư mục cha, CMake tham chiếu trực tiếp; giữ nguyên cấu trúc thư mục.
Ước tính workspace mảng mô hình: {meta['workspaceBytesEstimate']} bytes, không phải RAM đỉnh hoặc RAM toàn firmware.
Phải build và đo flash/RAM/thời gian trên phần cứng thật; file model nhỏ không bảo đảm board đủ bộ nhớ.
'''
    return {"firmware/CMakeLists.txt": 'cmake_minimum_required(VERSION 3.16)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(exported_model)\n', "firmware/main/CMakeLists.txt": 'idf_component_register(SRCS "main.cpp" "../../model.cpp" INCLUDE_DIRS "../.." REQUIRES freertos)\ntarget_compile_features(${COMPONENT_LIB} PRIVATE cxx_std_17)\n', "firmware/main/main.cpp": main, "firmware/sdkconfig.defaults": 'CONFIG_ESP_CONSOLE_UART_DEFAULT=y\nCONFIG_ESP_CONSOLE_UART_BAUDRATE=115200\n', "firmware/.idf-version": 'v5.4.2\n', "firmware/README.txt": readme}
