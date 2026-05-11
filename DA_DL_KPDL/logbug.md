2026-05-01 14:51:29.692003: E external/local_xla/xla/stream_executor/cuda/cuda_fft.cc:467] Unable to register cuFFT factory: Attempting to register factory for plugin cuFFT when one has already been registered
WARNING: All log messages before absl::InitializeLog() is called are written to STDERR
E0000 00:00:1777647090.123643   23233 cuda_dnn.cc:8579] Unable to register cuDNN factory: Attempting to register factory for plugin cuDNN when one has already been registered
E0000 00:00:1777647090.233166   23233 cuda_blas.cc:1407] Unable to register cuBLAS factory: Attempting to register factory for plugin cuBLAS when one has already been registered
W0000 00:00:1777647091.223915   23233 computation_placer.cc:177] computation placer already registered. Please check linkage and avoid linking the same target more than once.
W0000 00:00:1777647091.223959   23233 computation_placer.cc:177] computation placer already registered. Please check linkage and avoid linking the same target more than once.
W0000 00:00:1777647091.223970   23233 computation_placer.cc:177] computation placer already registered. Please check linkage and avoid linking the same target more than once.
W0000 00:00:1777647091.223973   23233 computation_placer.cc:177] computation placer already registered. Please check linkage and avoid linking the same target more than once.
INFO: VideoQualityAugmentor ENABLED (aug_prob=0.40)
INFO: Loading models onto cuda...
  📷 Đang tải CLIP ViT-B/32...
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/processor_config.json "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/preprocessor_config.json "HTTP/1.1 307 Temporary Redirect"
Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
WARNING: Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
INFO: HTTP Request: HEAD https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/preprocessor_config.json "HTTP/1.1 200 OK"
INFO: HTTP Request: GET https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/preprocessor_config.json "HTTP/1.1 200 OK"
preprocessor_config.json: 100%|████████████████| 316/316 [00:00<00:00, 1.18MB/s]
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/config.json "HTTP/1.1 307 Temporary Redirect"
INFO: HTTP Request: HEAD https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/config.json "HTTP/1.1 200 OK"
INFO: HTTP Request: GET https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/config.json "HTTP/1.1 200 OK"
config.json: 4.19kB [00:00, 6.96MB/s]
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/adapter_config.json "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/config.json "HTTP/1.1 307 Temporary Redirect"
INFO: HTTP Request: HEAD https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/config.json "HTTP/1.1 200 OK"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/model.safetensors "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/model.safetensors.index.json "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/pytorch_model.bin "HTTP/1.1 302 Found"
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/xet-read-token/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268 "HTTP/1.1 200 OK"
pytorch_model.bin: 100%|██████████████████████| 605M/605M [00:03<00:00, 194MB/s]
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/model.safetensors "HTTP/1.1 404 Not Found"
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32 "HTTP/1.1 200 OK"
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/commits/main "HTTP/1.1 200 OK"
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/discussions?p=0 "HTTP/1.1 200 OK"
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/commits/refs%2Fpr%2F66 "HTTP/1.1 200 OK"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/refs%2Fpr%2F66/model.safetensors.index.json "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/refs%2Fpr%2F66/model.safetensors "HTTP/1.1 302 Found"
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/xet-read-token/c237dc49a33fc61debc9276459120b7eac67e7ef "HTTP/1.1 200 OK"
model.safetensors:   0%|                             | 0.00/605M [00:00<?, ?B/s]
Loading weights:   0%|                                  | 0/199 [00:00<?, ?it/s]
Loading weights:   1%| | 1/199 [00:00<00:00, 2507.06it/s, Materializing param=vi
Loading weights:   1%| | 1/199 [00:00<00:00, 575.82it/s, Materializing param=vis
Loading weights:   1%| | 2/199 [00:00<00:00, 879.86it/s, Materializing param=vis
Loading weights:   1%| | 2/199 [00:00<00:00, 837.60it/s, Materializing param=vis
Loading weights:   2%| | 3/199 [00:00<00:00, 1142.86it/s, Materializing param=vi
Loading weights:   2%| | 3/199 [00:00<00:00, 1101.93it/s, Materializing param=vi
Loading weights:   2%| | 4/199 [00:00<00:00, 1394.27it/s, Materializing param=vi
Loading weights:   2%| | 4/199 [00:00<00:00, 1354.09it/s, Materializing param=vi
Loading weights:   3%| | 5/199 [00:00<00:00, 1615.68it/s, Materializing param=vi
Loading weights:   3%| | 5/199 [00:00<00:00, 1571.49it/s, Materializing param=vi
Loading weights:   3%| | 6/199 [00:00<00:00, 1753.35it/s, Materializing param=vi
Loading weights:   3%| | 6/199 [00:00<00:00, 1663.42it/s, Materializing param=vi
Loading weights:   4%| | 7/199 [00:00<00:00, 1820.67it/s, Materializing param=vi
Loading weights:   4%| | 7/199 [00:00<00:00, 1751.80it/s, Materializing param=vi
Loading weights:   4%| | 8/199 [00:00<00:00, 1887.31it/s, Materializing param=vi
Loading weights:   4%| | 8/199 [00:00<00:00, 1823.31it/s, Materializing param=vi
Loading weights:   5%| | 9/199 [00:00<00:00, 1953.67it/s, Materializing param=vi
Loading weights:   5%| | 9/199 [00:00<00:00, 1917.64it/s, Materializing param=vi
Loading weights:   5%| | 10/199 [00:00<00:00, 2068.71it/s, Materializing param=v
Loading weights:   5%| | 10/199 [00:00<00:00, 2032.71it/s, Materializing param=v
Loading weights:   6%| | 11/199 [00:00<00:00, 2175.57it/s, Materializing param=v
Loading weights:   6%| | 11/199 [00:00<00:00, 2125.46it/s, Materializing param=v
Loading weights:   6%| | 12/199 [00:00<00:00, 2211.41it/s, Materializing param=v
Loading weights:   6%| | 12/199 [00:00<00:00, 2155.35it/s, Materializing param=v
Loading weights:   7%| | 13/199 [00:00<00:00, 2228.00it/s, Materializing param=v
Loading weights:   7%| | 13/199 [00:00<00:00, 2158.76it/s, Materializing param=v
Loading weights:   7%| | 14/199 [00:00<00:00, 2218.62it/s, Materializing param=v
Loading weights:   7%| | 14/199 [00:00<00:00, 2153.29it/s, Materializing param=v
Loading weights:   8%| | 15/199 [00:00<00:00, 2204.98it/s, Materializing param=v
Loading weights:   8%| | 15/199 [00:00<00:00, 2168.35it/s, Materializing param=v
Loading weights:   8%| | 16/199 [00:00<00:00, 2260.70it/s, Materializing param=v
Loading weights:   8%| | 16/199 [00:00<00:00, 2232.42it/s, Materializing param=v
Loading weights:   9%| | 17/199 [00:00<00:00, 2303.15it/s, Materializing param=v
Loading weights:   9%| | 17/199 [00:00<00:00, 2249.88it/s, Materializing param=v
Loading weights:   9%| | 18/199 [00:00<00:00, 2305.69it/s, Materializing param=v
Loading weights:   9%| | 18/199 [00:00<00:00, 2261.55it/s, Materializing param=v
Loading weights:  10%| | 19/199 [00:00<00:00, 2313.80it/s, Materializing param=v
Loading weights:  10%| | 19/199 [00:00<00:00, 2270.81it/s, Materializing param=v
Loading weights:  10%| | 20/199 [00:00<00:00, 2311.04it/s, Materializing param=v
Loading weights:  10%| | 20/199 [00:00<00:00, 2271.49it/s, Materializing param=v
Loading weights:  11%| | 21/199 [00:00<00:00, 2309.09it/s, Materializing param=v
Loading weights:  11%| | 21/199 [00:00<00:00, 2269.53it/s, Materializing param=v
Loading weights:  11%| | 22/199 [00:00<00:00, 2316.60it/s, Materializing param=v
Loading weights:  11%| | 22/199 [00:00<00:00, 2293.56it/s, Materializing param=v
Loading weights:  12%| | 23/199 [00:00<00:00, 2360.04it/s, Materializing param=v
Loading weights:  12%| | 23/199 [00:00<00:00, 2339.61it/s, Materializing param=v
Loading weights:  12%| | 24/199 [00:00<00:00, 2393.21it/s, Materializing param=v
Loading weights:  12%| | 24/199 [00:00<00:00, 2362.05it/s, Materializing param=v
Loading weights:  13%|▏| 25/199 [00:00<00:00, 2399.10it/s, Materializing param=v
Loading weights:  13%|▏| 25/199 [00:00<00:00, 2364.69it/s, Materializing param=v
Loading weights:  13%|▏| 26/199 [00:00<00:00, 2402.45it/s, Materializing param=v
Loading weights:  13%|▏| 26/199 [00:00<00:00, 2369.30it/s, Materializing param=v
Loading weights:  14%|▏| 27/199 [00:00<00:00, 2406.42it/s, Materializing param=v
Loading weights:  14%|▏| 27/199 [00:00<00:00, 2374.08it/s, Materializing param=v
Loading weights:  14%|▏| 28/199 [00:00<00:00, 2401.70it/s, Materializing param=v
Loading weights:  14%|▏| 28/199 [00:00<00:00, 2370.72it/s, Materializing param=v
Loading weights:  15%|▏| 29/199 [00:00<00:00, 2404.56it/s, Materializing param=v
Loading weights:  15%|▏| 29/199 [00:00<00:00, 2374.29it/s, Materializing param=v
Loading weights:  15%|▏| 30/199 [00:00<00:00, 2401.41it/s, Materializing param=v
Loading weights:  15%|▏| 30/199 [00:00<00:00, 2371.23it/s, Materializing param=v
Loading weights:  16%|▏| 31/199 [00:00<00:00, 2412.80it/s, Materializing param=v
Loading weights:  16%|▏| 31/199 [00:00<00:00, 2395.77it/s, Materializing param=v
Loading weights:  16%|▏| 32/199 [00:00<00:00, 2445.70it/s, Materializing param=v
Loading weights:  16%|▏| 32/199 [00:00<00:00, 2428.93it/s, Materializing param=v
Loading weights:  17%|▏| 33/199 [00:00<00:00, 2478.68it/s, Materializing param=v
Loading weights:  17%|▏| 33/199 [00:00<00:00, 2455.68it/s, Materializing param=v
Loading weights:  17%|▏| 34/199 [00:00<00:00, 2498.14it/s, Materializing param=v
Loading weights:  17%|▏| 34/199 [00:00<00:00, 2481.97it/s, Materializing param=v
Loading weights:  18%|▏| 35/199 [00:00<00:00, 2529.43it/s, Materializing param=v
Loading weights:  18%|▏| 35/199 [00:00<00:00, 2513.41it/s, Materializing param=v
Loading weights:  18%|▏| 36/199 [00:00<00:00, 2560.36it/s, Materializing param=v
Loading weights:  18%|▏| 36/199 [00:00<00:00, 2544.74it/s, Materializing param=v
Loading weights:  19%|▏| 37/199 [00:00<00:00, 2590.07it/s, Materializing param=v
Loading weights:  19%|▏| 37/199 [00:00<00:00, 2574.43it/s, Materializing param=v
Loading weights:  19%|▏| 38/199 [00:00<00:00, 2604.82it/s, Materializing param=v
Loading weights:  19%|▏| 38/199 [00:00<00:00, 2589.29it/s, Materializing param=v
Loading weights:  20%|▏| 39/199 [00:00<00:00, 2632.79it/s, Materializing param=v
Loading weights:  20%|▏| 39/199 [00:00<00:00, 2596.43it/s, Materializing param=v
Loading weights:  20%|▏| 40/199 [00:00<00:00, 2608.84it/s, Materializing param=v
Loading weights:  20%|▏| 40/199 [00:00<00:00, 2571.18it/s, Materializing param=v
Loading weights:  21%|▏| 41/199 [00:00<00:00, 2586.90it/s, Materializing param=v
Loading weights:  21%|▏| 41/199 [00:00<00:00, 2554.05it/s, Materializing param=v
Loading weights:  21%|▏| 42/199 [00:00<00:00, 2540.02it/s, Materializing param=v
Loading weights:  21%|▏| 42/199 [00:00<00:00, 2507.23it/s, Materializing param=v
Loading weights:  22%|▏| 43/199 [00:00<00:00, 2519.84it/s, Materializing param=v
Loading weights:  22%|▏| 43/199 [00:00<00:00, 2483.89it/s, Materializing param=v
Loading weights:  22%|▏| 44/199 [00:00<00:00, 2492.60it/s, Materializing param=v
Loading weights:  22%|▏| 44/199 [00:00<00:00, 2462.96it/s, Materializing param=v
Loading weights:  23%|▏| 45/199 [00:00<00:00, 2477.80it/s, Materializing param=v
Loading weights:  23%|▏| 45/199 [00:00<00:00, 2449.31it/s, Materializing param=v
Loading weights:  23%|▏| 46/199 [00:00<00:00, 2461.35it/s, Materializing param=v
Loading weights:  23%|▏| 46/199 [00:00<00:00, 2445.26it/s, Materializing param=v
Loading weights:  24%|▏| 47/199 [00:00<00:00, 2476.85it/s, Materializing param=v
Loading weights:  24%|▏| 47/199 [00:00<00:00, 2464.74it/s, Materializing param=v
Loading weights:  24%|▏| 48/199 [00:00<00:00, 2498.13it/s, Materializing param=v
Loading weights:  24%|▏| 48/199 [00:00<00:00, 2486.56it/s, Materializing param=v
Loading weights:  25%|▏| 49/199 [00:00<00:00, 2508.59it/s, Materializing param=v
Loading weights:  25%|▏| 49/199 [00:00<00:00, 2489.80it/s, Materializing param=v
Loading weights:  25%|▎| 50/199 [00:00<00:00, 2510.09it/s, Materializing param=v
Loading weights:  25%|▎| 50/199 [00:00<00:00, 2490.98it/s, Materializing param=v
Loading weights:  26%|▎| 51/199 [00:00<00:00, 2509.56it/s, Materializing param=v
Loading weights:  26%|▎| 51/199 [00:00<00:00, 2486.11it/s, Materializing param=v
Loading weights:  26%|▎| 52/199 [00:00<00:00, 2505.56it/s, Materializing param=v
Loading weights:  26%|▎| 52/199 [00:00<00:00, 2494.35it/s, Materializing param=v
Loading weights:  27%|▎| 53/199 [00:00<00:00, 2524.94it/s, Materializing param=v
Loading weights:  27%|▎| 53/199 [00:00<00:00, 2514.77it/s, Materializing param=v
Loading weights:  27%|▎| 54/199 [00:00<00:00, 2537.19it/s, Materializing param=v
Loading weights:  27%|▎| 54/199 [00:00<00:00, 2519.05it/s, Materializing param=v
Loading weights:  28%|▎| 55/199 [00:00<00:00, 2537.95it/s, Materializing param=v
Loading weights:  28%|▎| 55/199 [00:00<00:00, 2520.53it/s, Materializing param=v
Loading weights:  28%|▎| 56/199 [00:00<00:00, 2538.21it/s, Materializing param=v
Loading weights:  28%|▎| 56/199 [00:00<00:00, 2521.13it/s, Materializing param=v
Loading weights:  29%|▎| 57/199 [00:00<00:00, 2535.10it/s, Materializing param=v
Loading weights:  29%|▎| 57/199 [00:00<00:00, 2518.31it/s, Materializing param=v
Loading weights:  29%|▎| 58/199 [00:00<00:00, 2534.80it/s, Materializing param=v
Loading weights:  29%|▎| 58/199 [00:00<00:00, 2518.37it/s, Materializing param=v
Loading weights:  30%|▎| 59/199 [00:00<00:00, 2534.43it/s, Materializing param=v
Loading weights:  30%|▎| 59/199 [00:00<00:00, 2514.09it/s, Materializing param=v
Loading weights:  30%|▎| 60/199 [00:00<00:00, 2527.91it/s, Materializing param=v
Loading weights:  30%|▎| 60/199 [00:00<00:00, 2510.28it/s, Materializing param=v
Loading weights:  31%|▎| 61/199 [00:00<00:00, 2531.94it/s, Materializing param=v
Loading weights:  31%|▎| 61/199 [00:00<00:00, 2522.23it/s, Materializing param=v
Loading weights:  31%|▎| 62/199 [00:00<00:00, 2548.53it/s, Materializing param=v
Loading weights:  31%|▎| 62/199 [00:00<00:00, 2532.40it/s, Materializing param=v
Loading weights:  32%|▎| 63/199 [00:00<00:00, 2554.24it/s, Materializing param=v
Loading weights:  32%|▎| 63/199 [00:00<00:00, 2544.62it/s, Materializing param=v
Loading weights:  32%|▎| 64/199 [00:00<00:00, 2570.24it/s, Materializing param=v
Loading weights:  32%|▎| 64/199 [00:00<00:00, 2561.09it/s, Materializing param=v
Loading weights:  33%|▎| 65/199 [00:00<00:00, 2587.21it/s, Materializing param=v
Loading weights:  33%|▎| 65/199 [00:00<00:00, 2574.75it/s, Materializing param=v
Loading weights:  33%|▎| 66/199 [00:00<00:00, 2587.00it/s, Materializing param=v
Loading weights:  33%|▎| 66/199 [00:00<00:00, 2572.21it/s, Materializing param=v
Loading weights:  34%|▎| 67/199 [00:00<00:00, 2591.68it/s, Materializing param=v
Loading weights:  34%|▎| 67/199 [00:00<00:00, 2582.70it/s, Materializing param=v
Loading weights:  34%|▎| 68/199 [00:00<00:00, 2607.23it/s, Materializing param=v
Loading weights:  34%|▎| 68/199 [00:00<00:00, 2597.35it/s, Materializing param=v
Loading weights:  35%|▎| 69/199 [00:00<00:00, 2620.80it/s, Materializing param=v
Loading weights:  35%|▎| 69/199 [00:00<00:00, 2607.50it/s, Materializing param=v
Loading weights:  35%|▎| 70/199 [00:00<00:00, 2624.39it/s, Materializing param=v
Loading weights:  35%|▎| 70/199 [00:00<00:00, 2610.44it/s, Materializing param=v
Loading weights:  36%|▎| 71/199 [00:00<00:00, 2624.03it/s, Materializing param=v
Loading weights:  36%|▎| 71/199 [00:00<00:00, 2589.08it/s, Materializing param=v
Loading weights:  36%|▎| 72/199 [00:00<00:00, 2599.08it/s, Materializing param=v
Loading weights:  36%|▎| 72/199 [00:00<00:00, 2589.76it/s, Materializing param=v
Loading weights:  37%|▎| 73/199 [00:00<00:00, 2611.42it/s, Materializing param=v
Loading weights:  37%|▎| 73/199 [00:00<00:00, 2603.12it/s, Materializing param=v
Loading weights:  37%|▎| 74/199 [00:00<00:00, 2624.79it/s, Materializing param=v
Loading weights:  37%|▎| 74/199 [00:00<00:00, 2616.45it/s, Materializing param=v
Loading weights:  38%|▍| 75/199 [00:00<00:00, 2633.82it/s, Materializing param=v
Loading weights:  38%|▍| 75/199 [00:00<00:00, 2622.53it/s, Materializing param=v
Loading weights:  38%|▍| 76/199 [00:00<00:00, 2641.10it/s, Materializing param=v
Loading weights:  38%|▍| 76/199 [00:00<00:00, 2632.68it/s, Materializing param=v
Loading weights:  39%|▍| 77/199 [00:00<00:00, 2654.25it/s, Materializing param=v
Loading weights:  39%|▍| 77/199 [00:00<00:00, 2646.27it/s, Materializing param=v
Loading weights:  39%|▍| 78/199 [00:00<00:00, 2667.26it/s, Materializing param=v
Loading weights:  39%|▍| 78/199 [00:00<00:00, 2659.15it/s, Materializing param=v
Loading weights:  40%|▍| 79/199 [00:00<00:00, 2674.16it/s, Materializing param=v
Loading weights:  40%|▍| 79/199 [00:00<00:00, 2665.81it/s, Materializing param=v
Loading weights:  40%|▍| 80/199 [00:00<00:00, 2680.58it/s, Materializing param=v
Loading weights:  40%|▍| 80/199 [00:00<00:00, 2668.07it/s, Materializing param=v
Loading weights:  41%|▍| 81/199 [00:00<00:00, 2679.16it/s, Materializing param=v
Loading weights:  41%|▍| 81/199 [00:00<00:00, 2665.43it/s, Materializing param=v
Loading weights:  41%|▍| 82/199 [00:00<00:00, 2673.36it/s, Materializing param=v
Loading weights:  41%|▍| 82/199 [00:00<00:00, 2660.10it/s, Materializing param=v
Loading weights:  42%|▍| 83/199 [00:00<00:00, 2671.47it/s, Materializing param=v
Loading weights:  42%|▍| 83/199 [00:00<00:00, 2662.70it/s, Materializing param=v
Loading weights:  42%|▍| 84/199 [00:00<00:00, 2677.74it/s, Materializing param=v
Loading weights:  42%|▍| 84/199 [00:00<00:00, 2661.28it/s, Materializing param=v
Loading weights:  43%|▍| 85/199 [00:00<00:00, 2670.61it/s, Materializing param=v
Loading weights:  43%|▍| 85/199 [00:00<00:00, 2656.40it/s, Materializing param=v
Loading weights:  43%|▍| 86/199 [00:00<00:00, 2663.92it/s, Materializing param=v
Loading weights:  43%|▍| 86/199 [00:00<00:00, 2647.98it/s, Materializing param=v
Loading weights:  44%|▍| 87/199 [00:00<00:00, 2656.57it/s, Materializing param=v
Loading weights:  44%|▍| 87/199 [00:00<00:00, 2644.31it/s, Materializing param=v
Loading weights:  44%|▍| 88/199 [00:00<00:00, 2659.37it/s, Materializing param=v
Loading weights:  44%|▍| 88/199 [00:00<00:00, 2651.88it/s, Materializing param=v
Loading weights:  45%|▍| 89/199 [00:00<00:00, 2670.58it/s, Materializing param=v
Loading weights:  45%|▍| 89/199 [00:00<00:00, 2659.69it/s, Materializing param=v
Loading weights:  45%|▍| 90/199 [00:00<00:00, 2672.48it/s, Materializing param=v
Loading weights:  45%|▍| 90/199 [00:00<00:00, 2661.19it/s, Materializing param=v
Loading weights:  46%|▍| 91/199 [00:00<00:00, 2671.59it/s, Materializing param=v
Loading weights:  46%|▍| 91/199 [00:00<00:00, 2658.64it/s, Materializing param=v
Loading weights:  46%|▍| 92/199 [00:00<00:00, 2666.33it/s, Materializing param=v
Loading weights:  46%|▍| 92/199 [00:00<00:00, 2654.68it/s, Materializing param=v
Loading weights:  47%|▍| 93/199 [00:00<00:00, 2665.25it/s, Materializing param=v
Loading weights:  47%|▍| 93/199 [00:00<00:00, 2657.88it/s, Materializing param=v
Loading weights:  47%|▍| 94/199 [00:00<00:00, 2675.14it/s, Materializing param=v
Loading weights:  47%|▍| 94/199 [00:00<00:00, 2667.97it/s, Materializing param=v
Loading weights:  48%|▍| 95/199 [00:00<00:00, 2677.24it/s, Materializing param=v
Loading weights:  48%|▍| 95/199 [00:00<00:00, 2666.40it/s, Materializing param=v
Loading weights:  48%|▍| 96/199 [00:00<00:00, 2675.70it/s, Materializing param=v
Loading weights:  48%|▍| 96/199 [00:00<00:00, 2664.39it/s, Materializing param=v
Loading weights:  49%|▍| 97/199 [00:00<00:00, 2672.65it/s, Materializing param=v
Loading weights:  49%|▍| 97/199 [00:00<00:00, 2659.17it/s, Materializing param=v
Loading weights:  49%|▍| 98/199 [00:00<00:00, 2667.60it/s, Materializing param=v
Loading weights:  49%|▍| 98/199 [00:00<00:00, 2655.82it/s, Materializing param=v
Loading weights:  50%|▍| 99/199 [00:00<00:00, 2662.67it/s, Materializing param=v
Loading weights:  50%|▍| 99/199 [00:00<00:00, 2649.95it/s, Materializing param=v
Loading weights:  50%|▌| 100/199 [00:00<00:00, 2653.36it/s, Materializing param=
Loading weights:  50%|▌| 100/199 [00:00<00:00, 2641.27it/s, Materializing param=
Loading weights:  51%|▌| 101/199 [00:00<00:00, 2648.05it/s, Materializing param=
Loading weights:  51%|▌| 101/199 [00:00<00:00, 2635.06it/s, Materializing param=
Loading weights:  51%|▌| 102/199 [00:00<00:00, 2641.40it/s, Materializing param=
Loading weights:  51%|▌| 102/199 [00:00<00:00, 2631.02it/s, Materializing param=
Loading weights:  52%|▌| 103/199 [00:00<00:00, 2640.28it/s, Materializing param=
Loading weights:  52%|▌| 103/199 [00:00<00:00, 2627.53it/s, Materializing param=
Loading weights:  52%|▌| 104/199 [00:00<00:00, 2632.94it/s, Materializing param=
Loading weights:  52%|▌| 104/199 [00:00<00:00, 2625.61it/s, Materializing param=
Loading weights:  53%|▌| 105/199 [00:00<00:00, 2639.21it/s, Materializing param=
Loading weights:  53%|▌| 105/199 [00:00<00:00, 2632.35it/s, Materializing param=
Loading weights:  53%|▌| 106/199 [00:00<00:00, 2638.87it/s, Materializing param=
Loading weights:  53%|▌| 106/199 [00:00<00:00, 2623.75it/s, Materializing param=
Loading weights:  54%|▌| 107/199 [00:00<00:00, 2628.87it/s, Materializing param=
Loading weights:  54%|▌| 107/199 [00:00<00:00, 2619.39it/s, Materializing param=
Loading weights:  54%|▌| 108/199 [00:00<00:00, 2627.31it/s, Materializing param=
Loading weights:  54%|▌| 108/199 [00:00<00:00, 2617.20it/s, Materializing param=
Loading weights:  55%|▌| 109/199 [00:00<00:00, 2624.06it/s, Materializing param=
Loading weights:  55%|▌| 109/199 [00:00<00:00, 2614.48it/s, Materializing param=
Loading weights:  55%|▌| 110/199 [00:00<00:00, 2622.81it/s, Materializing param=
Loading weights:  55%|▌| 110/199 [00:00<00:00, 2613.30it/s, Materializing param=
Loading weights:  56%|▌| 111/199 [00:00<00:00, 2621.09it/s, Materializing param=
Loading weights:  56%|▌| 111/199 [00:00<00:00, 2609.22it/s, Materializing param=
Loading weights:  56%|▌| 112/199 [00:00<00:00, 2620.01it/s, Materializing param=
Loading weights:  56%|▌| 112/199 [00:00<00:00, 2614.36it/s, Materializing param=
Loading weights:  57%|▌| 113/199 [00:00<00:00, 2628.90it/s, Materializing param=
Loading weights:  57%|▌| 113/199 [00:00<00:00, 2623.31it/s, Materializing param=
Loading weights:  57%|▌| 114/199 [00:00<00:00, 2636.24it/s, Materializing param=
Loading weights:  57%|▌| 114/199 [00:00<00:00, 2628.85it/s, Materializing param=
Loading weights:  58%|▌| 115/199 [00:00<00:00, 2633.91it/s, Materializing param=
Loading weights:  58%|▌| 115/199 [00:00<00:00, 2624.29it/s, Materializing param=
Loading weights:  58%|▌| 116/199 [00:00<00:00, 2631.41it/s, Materializing param=
Loading weights:  58%|▌| 116/199 [00:00<00:00, 2622.08it/s, Materializing param=
Loading weights:  59%|▌| 117/199 [00:00<00:00, 2629.14it/s, Materializing param=
Loading weights:  59%|▌| 117/199 [00:00<00:00, 2623.43it/s, Materializing param=
Loading weights:  59%|▌| 118/199 [00:00<00:00, 2637.17it/s, Materializing param=
Loading weights:  59%|▌| 118/199 [00:00<00:00, 2631.98it/s, Materializing param=
Loading weights:  60%|▌| 119/199 [00:00<00:00, 2646.18it/s, Materializing param=
Loading weights:  60%|▌| 119/199 [00:00<00:00, 2640.97it/s, Materializing param=
Loading weights:  60%|▌| 120/199 [00:00<00:00, 2654.59it/s, Materializing param=
Loading weights:  60%|▌| 120/199 [00:00<00:00, 2649.38it/s, Materializing param=
Loading weights:  61%|▌| 121/199 [00:00<00:00, 2660.10it/s, Materializing param=
Loading weights:  61%|▌| 121/199 [00:00<00:00, 2653.01it/s, Materializing param=
Loading weights:  61%|▌| 122/199 [00:00<00:00, 2661.62it/s, Materializing param=
Loading weights:  61%|▌| 122/199 [00:00<00:00, 2653.26it/s, Materializing param=
Loading weights:  62%|▌| 123/199 [00:00<00:00, 2659.99it/s, Materializing param=
Loading weights:  62%|▌| 123/199 [00:00<00:00, 2651.25it/s, Materializing param=
Loading weights:  62%|▌| 124/199 [00:00<00:00, 2657.04it/s, Materializing param=
Loading weights:  62%|▌| 124/199 [00:00<00:00, 2648.39it/s, Materializing param=
Loading weights:  63%|▋| 125/199 [00:00<00:00, 2655.40it/s, Materializing param=
Loading weights:  63%|▋| 125/199 [00:00<00:00, 2646.45it/s, Materializing param=
Loading weights:  63%|▋| 126/199 [00:00<00:00, 2652.74it/s, Materializing param=
Loading weights:  63%|▋| 126/199 [00:00<00:00, 2647.34it/s, Materializing param=
Loading weights:  64%|▋| 127/199 [00:00<00:00, 2659.38it/s, Materializing param=
Loading weights:  64%|▋| 127/199 [00:00<00:00, 2650.65it/s, Materializing param=
Loading weights:  64%|▋| 128/199 [00:00<00:00, 2655.12it/s, Materializing param=
Loading weights:  64%|▋| 128/199 [00:00<00:00, 2648.53it/s, Materializing param=
Loading weights:  65%|▋| 129/199 [00:00<00:00, 2653.02it/s, Materializing param=
Loading weights:  65%|▋| 129/199 [00:00<00:00, 2645.08it/s, Materializing param=
Loading weights:  65%|▋| 130/199 [00:00<00:00, 2650.76it/s, Materializing param=
Loading weights:  65%|▋| 130/199 [00:00<00:00, 2642.61it/s, Materializing param=
Loading weights:  66%|▋| 131/199 [00:00<00:00, 2646.78it/s, Materializing param=
Loading weights:  66%|▋| 131/199 [00:00<00:00, 2640.23it/s, Materializing param=
Loading weights:  66%|▋| 132/199 [00:00<00:00, 2645.28it/s, Materializing param=
Loading weights:  66%|▋| 132/199 [00:00<00:00, 2637.90it/s, Materializing param=
Loading weights:  67%|▋| 133/199 [00:00<00:00, 2643.70it/s, Materializing param=
Loading weights:  67%|▋| 133/199 [00:00<00:00, 2633.10it/s, Materializing param=
Loading weights:  67%|▋| 134/199 [00:00<00:00, 2639.22it/s, Materializing param=
Loading weights:  67%|▋| 134/199 [00:00<00:00, 2632.65it/s, Materializing param=
Loading weights:  68%|▋| 135/199 [00:00<00:00, 2638.41it/s, Materializing param=
Loading weights:  68%|▋| 135/199 [00:00<00:00, 2630.93it/s, Materializing param=
Loading weights:  68%|▋| 136/199 [00:00<00:00, 2635.25it/s, Materializing param=
Loading weights:  68%|▋| 136/199 [00:00<00:00, 2628.17it/s, Materializing param=
Loading weights:  69%|▋| 137/199 [00:00<00:00, 2633.91it/s, Materializing param=
Loading weights:  69%|▋| 137/199 [00:00<00:00, 2626.30it/s, Materializing param=
Loading weights:  69%|▋| 138/199 [00:00<00:00, 2631.12it/s, Materializing param=
Loading weights:  69%|▋| 138/199 [00:00<00:00, 2623.90it/s, Materializing param=
Loading weights:  70%|▋| 139/199 [00:00<00:00, 2627.74it/s, Materializing param=
Loading weights:  70%|▋| 139/199 [00:00<00:00, 2619.86it/s, Materializing param=
Loading weights:  70%|▋| 140/199 [00:00<00:00, 2622.49it/s, Materializing param=
Loading weights:  70%|▋| 140/199 [00:00<00:00, 2611.09it/s, Materializing param=
Loading weights:  71%|▋| 141/199 [00:00<00:00, 2616.07it/s, Materializing param=
Loading weights:  71%|▋| 141/199 [00:00<00:00, 2606.40it/s, Materializing param=
Loading weights:  71%|▋| 142/199 [00:00<00:00, 2611.99it/s, Materializing param=
Loading weights:  71%|▋| 142/199 [00:00<00:00, 2602.62it/s, Materializing param=
Loading weights:  72%|▋| 143/199 [00:00<00:00, 2609.27it/s, Materializing param=
Loading weights:  72%|▋| 143/199 [00:00<00:00, 2599.87it/s, Materializing param=
Loading weights:  72%|▋| 144/199 [00:00<00:00, 2606.51it/s, Materializing param=
Loading weights:  72%|▋| 144/199 [00:00<00:00, 2597.93it/s, Materializing param=
Loading weights:  73%|▋| 145/199 [00:00<00:00, 2603.79it/s, Materializing param=
Loading weights:  73%|▋| 145/199 [00:00<00:00, 2595.60it/s, Materializing param=
Loading weights:  73%|▋| 146/199 [00:00<00:00, 2603.21it/s, Materializing param=
Loading weights:  73%|▋| 146/199 [00:00<00:00, 2598.59it/s, Materializing param=
Loading weights:  74%|▋| 147/199 [00:00<00:00, 2609.62it/s, Materializing param=
Loading weights:  74%|▋| 147/199 [00:00<00:00, 2603.17it/s, Materializing param=
Loading weights:  74%|▋| 148/199 [00:00<00:00, 2613.28it/s, Materializing param=
Loading weights:  74%|▋| 148/199 [00:00<00:00, 2604.19it/s, Materializing param=
Loading weights:  75%|▋| 149/199 [00:00<00:00, 2607.21it/s, Materializing param=
Loading weights:  75%|▋| 149/199 [00:00<00:00, 2599.46it/s, Materializing param=
Loading weights:  75%|▊| 150/199 [00:00<00:00, 2601.56it/s, Materializing param=
Loading weights:  75%|▊| 150/199 [00:00<00:00, 2591.35it/s, Materializing param=
Loading weights:  76%|▊| 151/199 [00:00<00:00, 2593.57it/s, Materializing param=
Loading weights:  76%|▊| 151/199 [00:00<00:00, 2587.18it/s, Materializing param=
Loading weights:  76%|▊| 152/199 [00:00<00:00, 2589.54it/s, Materializing param=
Loading weights:  76%|▊| 152/199 [00:00<00:00, 2584.02it/s, Materializing param=
Loading weights:  77%|▊| 153/199 [00:00<00:00, 2588.68it/s, Materializing param=
Loading weights:  77%|▊| 153/199 [00:00<00:00, 2582.16it/s, Materializing param=
Loading weights:  77%|▊| 154/199 [00:00<00:00, 2584.23it/s, Materializing param=
Loading weights:  77%|▊| 154/199 [00:00<00:00, 2577.81it/s, Materializing param=
Loading weights:  78%|▊| 155/199 [00:00<00:00, 2582.90it/s, Materializing param=
Loading weights:  78%|▊| 155/199 [00:00<00:00, 2576.79it/s, Materializing param=
Loading weights:  78%|▊| 156/199 [00:00<00:00, 2580.44it/s, Materializing param=
Loading weights:  78%|▊| 156/199 [00:00<00:00, 2573.32it/s, Materializing param=
Loading weights:  79%|▊| 157/199 [00:00<00:00, 2579.12it/s, Materializing param=
Loading weights:  79%|▊| 157/199 [00:00<00:00, 2573.67it/s, Materializing param=
Loading weights:  79%|▊| 158/199 [00:00<00:00, 2578.61it/s, Materializing param=
Loading weights:  79%|▊| 158/199 [00:00<00:00, 2573.50it/s, Materializing param=
Loading weights:  80%|▊| 159/199 [00:00<00:00, 2576.25it/s, Materializing param=
Loading weights:  80%|▊| 159/199 [00:00<00:00, 2569.71it/s, Materializing param=
Loading weights:  80%|▊| 160/199 [00:00<00:00, 2574.43it/s, Materializing param=
Loading weights:  80%|▊| 160/199 [00:00<00:00, 2568.11it/s, Materializing param=
Loading weights:  81%|▊| 161/199 [00:00<00:00, 2571.28it/s, Materializing param=
Loading weights:  81%|▊| 161/199 [00:00<00:00, 2563.35it/s, Materializing param=
Loading weights:  81%|▊| 162/199 [00:00<00:00, 2569.35it/s, Materializing param=
Loading weights:  81%|▊| 162/199 [00:00<00:00, 2563.05it/s, Materializing param=
Loading weights:  82%|▊| 163/199 [00:00<00:00, 2567.50it/s, Materializing param=
Loading weights:  82%|▊| 163/199 [00:00<00:00, 2561.97it/s, Materializing param=
Loading weights:  82%|▊| 164/199 [00:00<00:00, 2567.05it/s, Materializing param=
Loading weights:  82%|▊| 164/199 [00:00<00:00, 2562.09it/s, Materializing param=
Loading weights:  83%|▊| 165/199 [00:00<00:00, 2565.90it/s, Materializing param=
Loading weights:  83%|▊| 165/199 [00:00<00:00, 2558.60it/s, Materializing param=
Loading weights:  83%|▊| 166/199 [00:00<00:00, 2563.99it/s, Materializing param=
Loading weights:  83%|▊| 166/199 [00:00<00:00, 2559.29it/s, Materializing param=
Loading weights:  84%|▊| 167/199 [00:00<00:00, 2563.87it/s, Materializing param=
Loading weights:  84%|▊| 167/199 [00:00<00:00, 2558.17it/s, Materializing param=
Loading weights:  84%|▊| 168/199 [00:00<00:00, 2561.57it/s, Materializing param=
Loading weights:  84%|▊| 168/199 [00:00<00:00, 2556.70it/s, Materializing param=
Loading weights:  85%|▊| 169/199 [00:00<00:00, 2561.32it/s, Materializing param=
Loading weights:  85%|▊| 169/199 [00:00<00:00, 2555.93it/s, Materializing param=
Loading weights:  85%|▊| 170/199 [00:00<00:00, 2559.40it/s, Materializing param=
Loading weights:  85%|▊| 170/199 [00:00<00:00, 2553.84it/s, Materializing param=
Loading weights:  86%|▊| 171/199 [00:00<00:00, 2559.38it/s, Materializing param=
Loading weights:  86%|▊| 171/199 [00:00<00:00, 2552.52it/s, Materializing param=
Loading weights:  86%|▊| 172/199 [00:00<00:00, 2555.88it/s, Materializing param=
Loading weights:  86%|▊| 172/199 [00:00<00:00, 2547.58it/s, Materializing param=
Loading weights:  87%|▊| 173/199 [00:00<00:00, 2552.27it/s, Materializing param=
Loading weights:  87%|▊| 173/199 [00:00<00:00, 2546.35it/s, Materializing param=
Loading weights:  87%|▊| 174/199 [00:00<00:00, 2550.73it/s, Materializing param=
Loading weights:  87%|▊| 174/199 [00:00<00:00, 2543.36it/s, Materializing param=
Loading weights:  88%|▉| 175/199 [00:00<00:00, 2548.25it/s, Materializing param=
Loading weights:  88%|▉| 175/199 [00:00<00:00, 2542.06it/s, Materializing param=
Loading weights:  88%|▉| 176/199 [00:00<00:00, 2547.44it/s, Materializing param=
Loading weights:  88%|▉| 176/199 [00:00<00:00, 2541.98it/s, Materializing param=
Loading weights:  89%|▉| 177/199 [00:00<00:00, 2545.26it/s, Materializing param=
Loading weights:  89%|▉| 177/199 [00:00<00:00, 2539.79it/s, Materializing param=
Loading weights:  89%|▉| 178/199 [00:00<00:00, 2544.12it/s, Materializing param=
Loading weights:  89%|▉| 178/199 [00:00<00:00, 2538.92it/s, Materializing param=
Loading weights:  90%|▉| 179/199 [00:00<00:00, 2542.85it/s, Materializing param=
Loading weights:  90%|▉| 179/199 [00:00<00:00, 2535.79it/s, Materializing param=
Loading weights:  90%|▉| 180/199 [00:00<00:00, 2539.72it/s, Materializing param=
Loading weights:  90%|▉| 180/199 [00:00<00:00, 2532.96it/s, Materializing param=
Loading weights:  91%|▉| 181/199 [00:00<00:00, 2537.21it/s, Materializing param=
Loading weights:  91%|▉| 181/199 [00:00<00:00, 2529.75it/s, Materializing param=
Loading weights:  91%|▉| 182/199 [00:00<00:00, 2534.70it/s, Materializing param=
Loading weights:  91%|▉| 182/199 [00:00<00:00, 2528.17it/s, Materializing param=
Loading weights:  92%|▉| 183/199 [00:00<00:00, 2532.98it/s, Materializing param=
Loading weights:  92%|▉| 183/199 [00:00<00:00, 2525.96it/s, Materializing param=
Loading weights:  92%|▉| 184/199 [00:00<00:00, 2528.89it/s, Materializing param=
Loading weights:  92%|▉| 184/199 [00:00<00:00, 2523.85it/s, Materializing param=
Loading weights:  93%|▉| 185/199 [00:00<00:00, 2528.08it/s, Materializing param=
Loading weights:  93%|▉| 185/199 [00:00<00:00, 2523.20it/s, Materializing param=
Loading weights:  93%|▉| 186/199 [00:00<00:00, 2525.46it/s, Materializing param=
Loading weights:  93%|▉| 186/199 [00:00<00:00, 2520.56it/s, Materializing param=
Loading weights:  94%|▉| 187/199 [00:00<00:00, 2524.10it/s, Materializing param=
Loading weights:  94%|▉| 187/199 [00:00<00:00, 2519.37it/s, Materializing param=
Loading weights:  94%|▉| 188/199 [00:00<00:00, 2522.23it/s, Materializing param=
Loading weights:  94%|▉| 188/199 [00:00<00:00, 2517.48it/s, Materializing param=
Loading weights:  95%|▉| 189/199 [00:00<00:00, 2522.16it/s, Materializing param=
Loading weights:  95%|▉| 189/199 [00:00<00:00, 2517.98it/s, Materializing param=
Loading weights:  95%|▉| 190/199 [00:00<00:00, 2521.33it/s, Materializing param=
Loading weights:  95%|▉| 190/199 [00:00<00:00, 2513.57it/s, Materializing param=
Loading weights:  96%|▉| 191/199 [00:00<00:00, 2518.33it/s, Materializing param=
Loading weights:  96%|▉| 191/199 [00:00<00:00, 2513.40it/s, Materializing param=
Loading weights:  96%|▉| 192/199 [00:00<00:00, 2515.24it/s, Materializing param=
Loading weights:  96%|▉| 192/199 [00:00<00:00, 2507.42it/s, Materializing param=
Loading weights:  97%|▉| 193/199 [00:00<00:00, 2510.26it/s, Materializing param=
Loading weights:  97%|▉| 193/199 [00:00<00:00, 2505.47it/s, Materializing param=
Loading weights:  97%|▉| 194/199 [00:00<00:00, 2508.25it/s, Materializing param=
Loading weights:  97%|▉| 194/199 [00:00<00:00, 2500.89it/s, Materializing param=
Loading weights:  98%|▉| 195/199 [00:00<00:00, 2505.49it/s, Materializing param=
Loading weights:  98%|▉| 195/199 [00:00<00:00, 2499.93it/s, Materializing param=
Loading weights:  98%|▉| 196/199 [00:00<00:00, 2504.21it/s, Materializing param=
Loading weights:  98%|▉| 196/199 [00:00<00:00, 2497.82it/s, Materializing param=
Loading weights:  99%|▉| 197/199 [00:00<00:00, 2502.98it/s, Materializing param=
Loading weights:  99%|▉| 197/199 [00:00<00:00, 2497.45it/s, Materializing param=
Loading weights:  99%|▉| 198/199 [00:00<00:00, 2503.33it/s, Materializing param=
Loading weights:  99%|▉| 198/199 [00:00<00:00, 2498.82it/s, Materializing param=
Loading weights: 100%|█| 199/199 [00:00<00:00, 2503.67it/s, Materializing param=
Loading weights: 100%|█| 199/199 [00:00<00:00, 2492.03it/s, Materializing param=
model.safetensors:   0%|                             | 0.00/605M [00:00<?, ?B/s]CLIPVisionModel LOAD REPORT from: openai/clip-vit-base-patch32
Key                                                          | Status     |  | 
-------------------------------------------------------------+------------+--+-
text_model.encoder.layers.{0...11}.mlp.fc2.bias              | UNEXPECTED |  | 
vision_model.embeddings.position_ids                         | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.out_proj.bias   | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.mlp.fc1.bias              | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.out_proj.weight | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm1.weight        | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.q_proj.bias     | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.mlp.fc1.weight            | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.q_proj.weight   | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm1.bias          | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.v_proj.weight   | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.k_proj.bias     | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.mlp.fc2.weight            | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.k_proj.weight   | UNEXPECTED |  | 
text_projection.weight                                       | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm2.weight        | UNEXPECTED |  | 
visual_projection.weight                                     | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm2.bias          | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.v_proj.bias     | UNEXPECTED |  | 
text_model.embeddings.position_ids                           | UNEXPECTED |  | 
text_model.embeddings.position_embedding.weight              | UNEXPECTED |  | 
logit_scale                                                  | UNEXPECTED |  | 
text_model.final_layer_norm.bias                             | UNEXPECTED |  | 
text_model.final_layer_norm.weight                           | UNEXPECTED |  | 
text_model.embeddings.token_embedding.weight                 | UNEXPECTED |  | 

Notes:
- UNEXPECTED	:can be ignored when loading from different task/architecture; not ok if you expect identical arch.
model.safetensors:   8%|█▋                   | 50.0M/605M [00:00<00:05, 108MB/s]  📷 Đang tải CLIP ViT-B/32...
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/processor_config.json "HTTP/1.1 404 Not Found"
model.safetensors:   8%|█▋                  | 50.0M/605M [00:00<00:06, 91.4MB/s]INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/preprocessor_config.json "HTTP/1.1 307 Temporary Redirect"
INFO: HTTP Request: HEAD https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/preprocessor_config.json "HTTP/1.1 200 OK"
model.safetensors:   8%|█▋                  | 50.0M/605M [00:00<00:07, 78.2MB/s]INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/config.json "HTTP/1.1 307 Temporary Redirect"
model.safetensors:   8%|█▋                  | 50.0M/605M [00:00<00:08, 66.7MB/s]INFO: HTTP Request: HEAD https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/config.json "HTTP/1.1 200 OK"
model.safetensors:  22%|████▉                 | 134M/605M [00:00<00:00, 502MB/s]INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/config.json "HTTP/1.1 307 Temporary Redirect"
model.safetensors:  22%|████▉                 | 134M/605M [00:00<00:00, 502MB/s]INFO: HTTP Request: HEAD https://huggingface.co/api/resolve-cache/models/openai/clip-vit-base-patch32/3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268/config.json "HTTP/1.1 200 OK"
model.safetensors:  22%|████▉                 | 134M/605M [00:01<00:00, 502MB/s]INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/model.safetensors "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/model.safetensors.index.json "HTTP/1.1 404 Not Found"
model.safetensors:  44%|█████████▋            | 268M/605M [00:01<00:00, 463MB/s]INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/pytorch_model.bin "HTTP/1.1 302 Found"
model.safetensors:  78%|████████████████▎    | 469M/605M [00:02<00:01, 83.6MB/s]INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/model.safetensors "HTTP/1.1 404 Not Found"
model.safetensors:  78%|████████████████▎    | 469M/605M [00:02<00:01, 83.6MB/s]INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32 "HTTP/1.1 200 OK"
model.safetensors:  78%|████████████████▎    | 469M/605M [00:02<00:01, 83.6MB/s]INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/commits/main "HTTP/1.1 200 OK"
model.safetensors: 100%|█████████████████████| 605M/605M [00:02<00:00, 75.5MB/s]INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/discussions?p=0 "HTTP/1.1 200 OK"
model.safetensors: 100%|██████████████████████| 605M/605M [00:02<00:00, 252MB/s]
INFO: HTTP Request: GET https://huggingface.co/api/models/openai/clip-vit-base-patch32/commits/refs%2Fpr%2F66 "HTTP/1.1 200 OK"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/refs%2Fpr%2F66/model.safetensors.index.json "HTTP/1.1 404 Not Found"
INFO: HTTP Request: HEAD https://huggingface.co/openai/clip-vit-base-patch32/resolve/refs%2Fpr%2F66/model.safetensors "HTTP/1.1 302 Found"
Loading weights: 100%|█| 199/199 [00:00<00:00, 2769.16it/s, Materializing param=
CLIPVisionModel LOAD REPORT from: openai/clip-vit-base-patch32
Key                                                          | Status     |  | 
-------------------------------------------------------------+------------+--+-
text_model.encoder.layers.{0...11}.mlp.fc2.bias              | UNEXPECTED |  | 
vision_model.embeddings.position_ids                         | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.out_proj.bias   | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.mlp.fc1.bias              | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.out_proj.weight | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm1.weight        | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.q_proj.bias     | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.mlp.fc1.weight            | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.q_proj.weight   | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm1.bias          | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.v_proj.weight   | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.k_proj.bias     | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.mlp.fc2.weight            | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.k_proj.weight   | UNEXPECTED |  | 
text_projection.weight                                       | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm2.weight        | UNEXPECTED |  | 
visual_projection.weight                                     | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.layer_norm2.bias          | UNEXPECTED |  | 
text_model.encoder.layers.{0...11}.self_attn.v_proj.bias     | UNEXPECTED |  | 
text_model.embeddings.position_ids                           | UNEXPECTED |  | 
text_model.embeddings.position_embedding.weight              | UNEXPECTED |  | 
logit_scale                                                  | UNEXPECTED |  | 
text_model.final_layer_norm.bias                             | UNEXPECTED |  | 
text_model.final_layer_norm.weight                           | UNEXPECTED |  | 
text_model.embeddings.token_embedding.weight                 | UNEXPECTED |  | 

Notes:
- UNEXPECTED	:can be ignored when loading from different task/architecture; not ok if you expect identical arch.
Traceback (most recent call last):
  File "/kaggle/working/DA_DL_KPDL/scripts/build_features_v6.py", line 302, in <module>
    main()
  File "/kaggle/working/DA_DL_KPDL/scripts/build_features_v6.py", line 243, in main
    'yolo':      load_yolo(args.yolo_weight),
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/kaggle/working/DA_DL_KPDL/scripts/inference_local.py", line 112, in load_yolo
    if not weights_path.exists():
           ^^^^^^^^^^^^^^^^^^^
AttributeError: 'str' object has no attribute 'exists'
