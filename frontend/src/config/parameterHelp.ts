interface ParameterHelp {
  meaning: string;
  example: string;
}

const help: Record<string, ParameterHelp> = {
  C: { meaning: "Điều chỉnh mức model ưu tiên khớp dữ liệu train hay giữ quy tắc đơn giản. C nhỏ thường phạt độ phức tạp mạnh hơn; C lớn cho phép khớp dữ liệu chặt hơn.", example: "Bắt đầu với 1. Tăng C không có nghĩa là model chắc chắn tốt hơn." },
  max_depth: { meaning: "Giới hạn số tầng quyết định của mỗi cây. Cây sâu có thể học quy tắc chi tiết hơn nhưng cũng dễ nhớ quá kỹ dữ liệu train.", example: "8 nghĩa là tối đa 8 tầng. Với LightGBM, -1 nghĩa là không giới hạn độ sâu; các model có hỗ trợ none dùng none." },
  n_estimators: { meaning: "Số cây được tạo trong tổ hợp hoặc số bước thêm cây của boosting. Đây không phải epoch của mạng neural.", example: "100 nghĩa là cấu hình 100 cây hoặc 100 bước boosting. Nhiều cây thường tốn thêm thời gian và bộ nhớ." },
  min_samples_split: { meaning: "Một nút của cây phải có ít nhất bao nhiêu mẫu mới được phép chia tiếp.", example: "Đặt 10: nút chỉ có 6 mẫu sẽ không được tách tiếp." },
  min_samples_leaf: { meaning: "Số mẫu tối thiểu cần giữ ở mỗi lá, tức một nhóm cuối cùng của cây.", example: "Đặt 5 giúp tránh tạo nhóm cuối chỉ đại diện cho 1 mẫu." },
  criterion: { meaning: "Cách cây chấm điểm để chọn phép chia dữ liệu. Không phải chỉ số cuối cùng dùng để so sánh các model.", example: "gini thường dùng cho phân loại; squared_error dùng cho hồi quy." },
  max_features: { meaning: "Số cột input mà cây xét tại mỗi lần tìm phép chia. Dùng một phần cột giúp các cây đa dạng hơn.", example: "Có 16 cột: sqrt thường xét khoảng 4 cột mỗi lần tách; log2 cũng khoảng 4." },
  bootstrap: { meaning: "Bật để mỗi cây học từ một tập mẫu được bốc thăm có hoàn lại: một dòng có thể được chọn nhiều lần.", example: "Mỗi cây nhìn một bộ mẫu hơi khác nhau thay vì luôn nhìn đúng một danh sách giống hệt." },
  learning_rate: { meaning: "Mức đóng góp của mỗi cây mới trong boosting. Nhỏ hơn làm các bước điều chỉnh nhẹ hơn và có thể cần thêm cây.", example: "0.1 là một cấu hình khởi đầu; nếu giảm xuống 0.01 thường cần xem lại số cây." },
  subsample: { meaning: "Tỷ lệ mẫu train được lấy cho mỗi bước học của boosting.", example: "0.8 nghĩa là dùng khoảng 80% mẫu mỗi bước; 1 nghĩa là dùng toàn bộ." },
  n_neighbors: { meaning: "KNN xem bao nhiêu mẫu gần nhất để đưa ra dự đoán.", example: "K = 5: tham khảo 5 hàng gần nhất trong dữ liệu train. K không được vượt số hàng train." },
  weights: { meaning: "Cách KNN tính mức ảnh hưởng của các mẫu hàng xóm.", example: "uniform: mỗi hàng xóm ngang nhau. distance: mẫu càng gần càng có ảnh hưởng lớn." },
  p: { meaning: "Cách tính khoảng cách giữa hai hàng dữ liệu trong KNN.", example: "2: khoảng cách đường thẳng (Euclidean). 1: cộng chênh lệch tuyệt đối từng cột (Manhattan)." },
  kernel: { meaning: "Cách SVM tạo ranh giới dự đoán. linear dùng ranh giới tuyến tính; các kernel khác cho phép quan hệ phức tạp hơn.", example: "rbf thường dùng khi quan hệ không đơn giản. Kernel phức tạp hơn không bảo đảm chính xác hơn." },
  gamma: { meaning: "Điều chỉnh phạm vi ảnh hưởng của từng mẫu trong một số kernel SVM.", example: "scale và auto là hai cách thư viện tính gamma. auto ở đây chỉ là công thức cho một tham số, không phải tự tối ưu toàn bộ model." },
  degree: { meaning: "Bậc của đa thức khi dùng kernel poly trong SVM.", example: "3 dùng đa thức bậc ba. Thông số này không áp dụng khi kernel là rbf hoặc linear." },
  epsilon: { meaning: "Khoảng sai số quanh dự đoán mà SVR có thể bỏ qua khi học.", example: "0.1 tạo vùng không phạt rộng ±0.1 theo đơn vị của label." },
  var_smoothing: { meaning: "Thêm một lượng nhỏ vào phương sai để Gaussian Naive Bayes tính toán ổn định hơn.", example: "1e-9 là 0.000000001. Đây không phải learning rate hay số epoch." },
  hidden_layer_sizes: { meaning: "Cấu trúc các tầng ẩn của mạng neural: mỗi số là số neuron của một tầng.", example: "64,32 nghĩa là 2 tầng ẩn: tầng đầu 64 neuron, tầng sau 32 neuron. Mạng lớn hơn tốn thêm bộ nhớ." },
  batch_size: { meaning: "Số mẫu được mạng neural xử lý trong một nhóm trước khi cập nhật trọng số.", example: "32 nghĩa là mỗi nhóm có 32 mẫu. auto dùng min(200, số mẫu train); không phải tự tìm batch size tốt nhất." },
  activation: { meaning: "Hàm giúp mạng neural học các quan hệ phi tuyến giữa input và kết quả.", example: "relu là cấu hình khởi đầu phổ biến; tanh cho đầu ra neuron nằm trong khoảng -1 đến 1." },
  learning_rate_init: { meaning: "Độ lớn bước thay đổi trọng số lúc bắt đầu học của mạng neural.", example: "0.001 tương đương 1/1000. Quá lớn có thể làm việc học không ổn định; quá nhỏ có thể học chậm." },
  fit_intercept: { meaning: "Cho phép model tuyến tính học thêm một giá trị bù ngoài các hệ số nhân với input.", example: "Trong y = ax + b, giá trị b là hệ số chặn. Thường có thể giữ bật." },
  class_weight: { meaning: "Điều chỉnh mức quan trọng của các lớp trong Logistic Regression khi số mẫu giữa các lớp không đều.", example: "balanced tăng ảnh hưởng của lớp ít mẫu. none giữ trọng số mẫu thông thường." },
  early_stopping: { meaning: "Cho phép MLP dừng trước số epoch tối đa nếu kết quả trên validation nội bộ không còn cải thiện.", example: "Đặt tối đa 200 epoch nhưng có thể dừng ở epoch 70. Đây không phải tự tìm thông số tối ưu." },
  validation_fraction: { meaning: "Phần dữ liệu lấy riêng từ tập train để MLP theo dõi early stopping. Không phải tập validation chung ở phía trên.", example: "Có 70 mẫu train và đặt 0.1: lấy khoảng 7 mẫu trong số 70 mẫu này để kiểm tra nội bộ." },
  n_iter_no_change: { meaning: "Số epoch MLP có thể chờ khi kết quả chưa cải thiện đủ theo ngưỡng của bộ huấn luyện.", example: "10 nghĩa là chờ 10 epoch không cải thiện trước khi cơ chế dừng hoặc điều chỉnh tương ứng được kích hoạt." },
  colsample_bytree: { meaning: "Tỷ lệ cột input được dùng khi tạo từng cây trong boosting.", example: "0.8 nghĩa là mỗi cây được xét khoảng 80% cột input." },
  reg_lambda: { meaning: "Mức phạt L2 giúp hạn chế độ phức tạp của model boosting.", example: "Tăng giá trị này thường hạn chế việc khớp quá sát dữ liệu train, nhưng quá cao cũng có thể học chưa đủ." },
  min_child_weight: { meaning: "Ngưỡng tổng trọng số bậc hai của mẫu cần có ở một nút con trong XGBoost. Với một số bài toán, nó gần với ý tưởng cần đủ dữ liệu trước khi tách.", example: "Không phải lúc nào 5 cũng có nghĩa là 5 dòng. Có thể giữ giá trị khởi đầu 1 khi chưa cần tinh chỉnh." },
  num_leaves: { meaning: "Số nhóm cuối cùng tối đa mà một cây LightGBM có thể tạo.", example: "31 nghĩa là tối đa 31 lá. Nhiều lá cho phép quy tắc chi tiết hơn nhưng tăng độ phức tạp." },
  min_child_samples: { meaning: "Số mẫu tối thiểu LightGBM yêu cầu ở một lá.", example: "20 giúp hạn chế tạo nhóm chỉ dựa vào vài mẫu. Với dữ liệu rất ít, cần xem lại tham số này." },
  iterations: { meaning: "Số vòng boosting tối đa của CatBoost, mỗi vòng bổ sung model cây để sửa lỗi.", example: "200 nghĩa là cấu hình 200 vòng boosting; không phải 200 epoch của MLP." },
  depth: { meaning: "Độ sâu cây trong CatBoost. Tăng độ sâu có thể làm số lá và bộ nhớ tăng nhanh.", example: "6 là một cấu hình khởi đầu. Không nên tăng chỉ vì muốn model chính xác hơn." },
  l2_leaf_reg: { meaning: "Mức regularization L2 cho các giá trị ở lá trong CatBoost.", example: "Giữ 3 để bắt đầu; tăng hoặc giảm cần dựa vào kết quả validation." },
};

export function getParameterHelp(modelId: string, key: string): ParameterHelp | undefined {
  if (key === "max_iter") return modelId === "mlp"
    ? { meaning: "Số lượt tối đa mạng neural đi qua tập train. Một lượt qua toàn bộ tập train được gọi là một epoch.", example: "200 là tối đa 200 epoch, không phải 200 giây. Model có thể dừng sớm theo điều kiện hội tụ." }
    : { meaning: "Giới hạn số vòng lặp của thuật toán tìm hệ số Logistic Regression. Không phải epoch của mạng neural.", example: "1000 cho phép thuật toán lặp tối đa 1000 lần, và có thể kết thúc sớm khi đã hội tụ." };
  if (key === "solver") return modelId === "mlp"
    ? { meaning: "Thuật toán cập nhật trọng số khi mạng neural học.", example: "adam tự điều chỉnh bước cập nhật; sgd dùng phương pháp gradient theo nhóm mẫu." }
    : { meaning: "Thuật toán tìm hệ số cho Logistic Regression.", example: "Có thể giữ lbfgs để bắt đầu; saga là một lựa chọn khác." };
  if (key === "alpha") return { meaning: "Mức phạt L2 trong Ridge Regression hoặc MLP để hạn chế hệ số quá lớn.", example: "Giá trị lớn hơn thường làm việc học bị ràng buộc mạnh hơn. Tham số này không giống C: tăng C lại làm regularization yếu đi." };
  return help[key];
}