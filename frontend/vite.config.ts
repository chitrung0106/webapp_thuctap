import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
const headers={"Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Embedder-Policy":"require-corp"};
export default defineConfig({plugins:[react()],optimizeDeps:{include:["@tensorflow/tfjs","@tensorflow/tfjs-backend-webgpu"]},worker:{format:"es"},server:{port:5173,headers},preview:{headers}});
