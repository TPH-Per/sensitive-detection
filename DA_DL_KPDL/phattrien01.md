# Phát triển 01 - Tình hình dự án và hướng đi tiếp theo

Ngày cập nhật: 2026-05-07

## 1. Mục tiêu của tài liệu này

Tài liệu này được viết để trả lời 3 câu hỏi lớn:

1. Dự án đang ở trạng thái nào?
2. Các khái niệm như `gate`, `score`, `KD`, `teacher`, `student` nghĩa là gì?
3. Hướng phát triển tiếp theo nào là hợp lý, có căn cứ khoa học, và không làm theo kiểu đoán mò?

Mục tiêu không phải là “viết cho hay”, mà là giúp mình nhìn rõ:

- cái gì đã chốt được,
- cái gì chỉ là ý tưởng,
- cái gì cần thí nghiệm thêm trước khi tin.

## 2. Trạng thái hiện tại của dự án

### 2.1. V6.1 là baseline đang chạy được

Hiện tại, V6.1 là mốc ổn định nhất của toàn bộ hệ thống.

V6.1 đã có:

- checkpoint đã train xong
- calibration threshold
- manifest khóa split
- metric rõ ràng
- artifact để demo và suy luận

Điều này có nghĩa:

- đây không còn là “ý tưởng kiến trúc”
- đây là một pipeline có thể chạy thật
- nếu làm phiên bản mới, ta phải so sánh với V6.1 chứ không được so với cảm giác

### 2.2. Kết quả chính của V6.1

Mốc tốt nhất của V6 cho nhãn `Violence`:

- `F2 = 0.8809`
- `PR-AUC = 0.8608`
- `ROC-AUC = 0.9315`

Threshold đã calibrate:

- `V = 0.9136`
- `S = 0.995`
- `N = 0.999`

Ý nghĩa thực tế:

- `V` đã được tối ưu tương đối tốt cho bài toán bạo lực
- `S` và `N` dùng ngưỡng rất cao vì chúng dễ bị over-trigger nếu đặt ngưỡng thấp
- pipeline hiện tại đã có “mốc chuẩn” để đem mọi phiên bản sau ra so sánh

### 2.3. Các expert branch riêng hiện đang mạnh

Các model chuyên gia riêng trong V6.1 đang khá tốt:

- `Gore detector`:
  - test `AUC = 0.9996`
  - test `Recall = 0.9355`
- `SelfHarm detector`:
  - best val `AUC = 0.9993`
  - best val `Recall = 0.9483`
- `NSFW classifier`:
  - best val `F1 = 0.9488`
  - val `AUC` khoảng `0.9814`

Điều này cho thấy:

- vấn đề chính không nằm ở việc “không có expert”
- vấn đề chính nằm ở chỗ:
  - gom expert signal như thế nào
  - dùng expert signal để quyết định task như thế nào
  - có cần student học lại từ expert hay không

### 2.4. V7 hiện có code path nhưng chưa vượt V6

V7 đã có đầy đủ đường code:

- `prepare_video_manifests_v7.py`
- `train_v7_videomae_lora.py`
- `calibrate_v7.py`
- `evaluate_v7.py`

V7 đã đổi kiến trúc sang:

- raw video
- VideoMAE
- LoRA
- aux summary
- pseudo teacher cho `S/N`

Nhưng về kết quả hiện tại, V7 chưa vượt V6:

- best val `Violence` của V7:
  - `F2 = 0.8207`
  - `PR-AUC = 0.7429`
  - `ROC-AUC = 0.8610`

Điều này nói lên:

- ý tưởng V7 là hợp lý
- nhưng implementation hiện tại chưa đủ mạnh để thay baseline
- nhất là khi `S` có dấu hiệu saturate khá cao

### 2.5. Lệch pha dữ liệu: video thật vs ảnh tĩnh

Đây là điểm cần chốt rất rõ vì nó ảnh hưởng trực tiếp đến kiến trúc.

- `Violence (V)` có video thật, nên cần features theo thời gian.
- `NSFW (N)` và `Self-harm (S)` trong dữ liệu hiện tại lại nghiêng nhiều về ảnh tĩnh hoặc tín hiệu không có cấu trúc thời gian thật sự.

Nếu cố làm theo cách:

- copy 1 ảnh tĩnh thành 16 frame giống hệt nhau
- rồi nhét vào `VideoMAE`

thì ta không tạo ra thông tin thời gian mới.
Ta chỉ tạo ra một chuỗi giả, còn bản chất `3D attention` vẫn không có gì để học ngoài sự lặp lại.

Hệ quả:

- `VideoMAE` có thể học sai động lực của dữ liệu
- model dễ tin vào shortcut do lặp ảnh hoặc noise nhỏ
- `N` và `S` dễ trở nên over-confident
- `S` có thể sinh hallucination vì student video đang cố học từ một teacher ảnh tĩnh lệch miền

Vì vậy, kết luận thực dụng là:

- `V` nên đi với backbone video-native như `VideoMAE`
- `N` và `S` không nên bị ép chung backbone video nếu nguồn dữ liệu gốc không có thời gian thật
- KD từ ảnh sang video chỉ nên xem là thử nghiệm phụ, không nên mặc định là chiến lược chính

Nói ngắn gọn:

- một backbone video cho cả 3 task không còn là giả định an toàn
- đây có thể chính là nguyên nhân làm `S` hallucinate và `N` quá tự tin

## 3. Giải thích các khái niệm cốt lõi

### 3.1. `Gate` là gì?

`Gate` là cơ chế điều hướng tín hiệu.

Hãy hiểu đơn giản:

- model có nhiều nguồn thông tin
- không phải nguồn nào cũng quan trọng như nhau cho mọi task
- `gate` học xem task nào nên tin vào frame nào, expert nào, hay modality nào

Ví dụ:

- với `Violence`, model có thể cần chú ý vào chuyển động, vật thể nguy hiểm, hoặc máu
- với `NSFW`, model có thể cần chú ý nhiều hơn vào ngữ nghĩa thị giác và pattern nhạy cảm
- với `Self-harm`, model có thể cần chú ý đến event ngắn và tín hiệu rất yếu

Vì vậy:

- `gate` không phải là kết quả cuối
- `gate` chỉ là bộ định tuyến tín hiệu
- nó trả lời câu hỏi: “ta nên tin chỗ nào hơn?”

### 3.2. `Score` là gì?

`Score` là giá trị đầu ra cuối cùng mà model dùng để ra quyết định.

Ví dụ:

- score của `Violence`
- score của `Self-harm`
- score của `NSFW`

Sau khi có score:

- ta so với threshold
- nếu score lớn hơn threshold thì flag dương tính

Nói ngắn gọn:

- `gate` là cách model nhìn
- `score` là kết luận model đưa ra

### 3.3. `Teacher` và `Student` là gì?

Đây là cặp khái niệm rất quan trọng trong KD.

#### Teacher

`Teacher` là mô hình/nguồn tín hiệu mạnh hơn, hoặc ổn định hơn, dùng để dạy cho model khác.

Trong dự án này, teacher thường là:

- `Gore detector`
- `SelfHarm detector`
- `NSFW classifier`
- hoặc một tín hiệu expert đã được nén lại từ feature cache

#### Student

`Student` là model đang học lại từ teacher.

Trong dự án này, student có thể là:

- `TaskGatedModelV6`
- hoặc `VideoModerationV7`

Student không nhất thiết phải copy y hệt teacher.
Student học để:

- tổng hợp nhiều nguồn tín hiệu
- ra quyết định cuối tốt hơn
- có thể chạy gọn hơn, nhanh hơn, hoặc phù hợp hơn với task thật

### 3.4. `KD` là gì?

`KD` là viết tắt của `Knowledge Distillation`, tức là “chưng cất tri thức”.

Ý tưởng là:

- teacher đã biết một phần bài toán tốt hơn
- student không học từ nhãn cứng בלבד
- student học thêm từ phân phối, score mềm, attention, hoặc pseudo label của teacher

Trong dự án này, KD không phải kiểu lý thuyết trừu tượng.
Nó đang xuất hiện theo 2 hình thức:

- V6: học `S/N gate` từ phân bố tín hiệu expert theo thời gian
- V7: học `S/N head` từ pseudo teacher được nén từ feature cache

### 3.5. `Pseudo teacher` là gì?

`Pseudo teacher` là teacher không phải ground truth hoàn chỉnh, mà là một tín hiệu trung gian đã được tạo ra từ các expert hoặc feature có sẵn.

Ví dụ:

- lấy output của `SelfHarmDetector`
- lấy output của `NSFWClassifier`
- lấy score theo frame
- rồi nén lại thành một tín hiệu dạy student

Tại sao phải làm vậy?

- vì không phải lúc nào cũng có nhãn video-level sạch cho `S` và `N`
- nhưng vẫn có tín hiệu expert hữu ích
- nên ta dùng nó như giáo viên “tạm đủ tốt”

## 4. Giải thích vì sao không nên lấy thẳng score expert

### 4.1. Expert score nói gì?

Expert score thường chỉ trả lời câu hỏi rất hẹp:

- frame này có giống gore không?
- frame này có giống self-harm không?
- frame này có giống NSFW không?

Nhưng moderation là bài toán rộng hơn:

- đây có thật sự là `Violence` không?
- đây là `Self-harm` hay chỉ là y tế / phẫu thuật / wound?
- đây là `NSFW` hay chỉ là cảnh da thịt không thuộc ngữ cảnh cấm?

### 4.2. Vì sao không thể dùng expert score làm đầu ra cuối ngay?

Vì expert score thường bị thiếu ngữ cảnh.

Ví dụ:

- một cảnh phẫu thuật có thể làm `Gore detector` cao
- nhưng không vì thế mà video đó là `Violence`
- một cảnh y tế có thể trông “ghê” nhưng không phải `Self-harm`

Nếu chỉ lấy thẳng score expert:

- model dễ nhầm ngữ nghĩa với ngữ cảnh
- dễ tăng false positive
- dễ không phân biệt được “bằng chứng” với “kết luận”

Cho nên cần 2 tầng:

1. Expert tạo bằng chứng
2. Gate hoặc head của task quyết định bằng chứng đó có đáng tin không

## 5. Có phải gate và expert đều nhìn toàn bộ frame không?

### 5.1. Câu trả lời ngắn

Có, nhưng chỉ trên tập frame đã sample của clip/scene, không phải toàn bộ video gốc.

### 5.2. Trong V6

V6 thường làm việc theo scene.

Mỗi scene có thể sample tối đa một số frame nhất định, ví dụ:

- `64 frame`

Trong tập frame đó:

- expert nhìn toàn bộ frame để sinh tín hiệu theo frame
- gate cũng nhìn toàn bộ frame để học attention theo task

### 5.3. Trong V7

V7 làm việc trên raw video, nhưng cũng không dùng toàn bộ frame gốc.

Thường chỉ sample một clip ngắn, ví dụ:

- `16 frame`

Điều quan trọng là:

- cả expert và gate đều học trên cùng một tập frame đã rút gọn
- nhưng expert tạo “chứng cứ”
- còn gate học “mức độ quan trọng”

## 6. Vì sao KD có lý do tồn tại trong dự án này?

### 6.1. Bài toán của `Violence` khác `S/N`

`Violence` có label video-level rõ hơn.
`Self-harm` và `NSFW` thường khó hơn vì:

- nhãn yếu hơn
- dữ liệu thật ít hơn
- ngữ cảnh dễ nhầm hơn

### 6.2. KD giúp gì?

KD giúp student không phải học từ số 0.

Nó có thể:

- cho student biết frame nào cần chú ý
- giữ cho output bớt nhiễu
- truyền kiến thức từ expert sang task head

Đặc biệt với `S` và `N`:

- nhãn thẳng không đủ đẹp
- nên cần pseudo teacher hoặc weak supervision
- nếu không, student dễ collapse về toàn 0 hoặc học chậm

### 6.3. KD không phải lúc nào cũng tốt

KD có rủi ro:

- teacher có shortcut
- student học lại bias của teacher
- score bị saturate
- student kém hơn baseline không KD

Vì vậy:

- KD phải được kiểm tra bằng thí nghiệm
- không nên mặc định là đúng chỉ vì nghe “khoa học”

## 7. Diễn giải riêng cho `V`, `S`, `N`

### 7.1. `Violence`

`Violence` là task quan trọng nhất và có nhãn tốt nhất.

Kết luận thực dụng:

- `V` nên là task supervised trực tiếp
- `V` không nên phụ thuộc quá nhiều vào KD
- nếu muốn cải thiện `V`, nên kiểm tra VideoMAE có thật sự giải shortcut không

Hướng tốt:

- `Violence-first`
- train `V-only` trước
- tạm thời để `lambda_s = 0`, `lambda_n = 0`
- chỉ thêm `S/N` sau khi `V` thật sự thắng baseline

### 7.2. `NSFW`

`N` hiện có expert riêng khá mạnh.

Hướng hợp lý:

- giữ `NSFW expert`
- dùng event pooling và calibration riêng
- chỉ thêm student `N` nếu nó chứng minh được tốt hơn baseline
- nếu student là video backbone, phải có bằng chứng rằng dữ liệu `N` thật sự mang tính thời gian; nếu không, nên dùng image backbone hoặc image encoder riêng

Nói dễ hiểu:

- `N` chưa cần ép đi chung một đường với `V`
- vì `N` có thể đã đủ tốt bằng expert + threshold riêng
- ép ảnh tĩnh thành video giả rồi cho `VideoMAE` học không phải là mặc định đúng

### 7.3. `Self-harm`

`S` là task khó nhất.

Tại sao?

- dễ nhầm với y tế
- dễ nhầm với surgery
- dễ nhầm với wound
- tín hiệu thường rất ngắn và yếu

Hướng hợp lý:

- giữ `SelfHarmDetector` riêng
- tăng hard negative y tế
- dùng calibration riêng
- nếu KD thì để sau, không vội
- nếu dữ liệu đầu vào chủ yếu là ảnh tĩnh, nên ưu tiên image backbone hoặc image encoder trước khi nghĩ đến video backbone

## 8. Hướng đi tiếp theo hợp lý và khoa học

### 8.1. Nguyên tắc chung

Không nên thêm kiến trúc mới chỉ vì thấy “có vẻ hay”.

Phải đi theo thứ tự:

1. Baseline không KD
2. Baseline có gate nhưng không KD
3. Gate + KD
4. Giữ KD chỉ khi nó thắng thật trên val/test

### 8.2. Hướng tốt nhất cho `V`

Hiện tại, hướng tốt nhất cho `V` là:

- tách thành một thí nghiệm riêng
- dùng VideoMAE + LoRA nhưng chỉ tối ưu `Violence`
- chưa thêm `S/N`

Lý do:

- V7 hiện chưa vượt V6 trên `Violence`
- nếu `V-only` còn chưa thắng V6 thì chưa nên kéo thêm nhiệm vụ khác vào
- `N` và `S` không nên bị kéo vào cùng backbone video nếu dữ liệu gốc của chúng không có thời gian thật

### 8.3. Hướng tốt nhất cho `N`

Ngắn hạn:

- giữ expert riêng
- calibration riêng
- đánh giá riêng
- ưu tiên image backbone hoặc image encoder riêng nếu dữ liệu gốc là ảnh tĩnh

Trung hạn:

- thử student `N`
- so với expert-late-fusion
- chỉ thử video backbone nếu chứng minh được việc mô phỏng chuỗi frame có ích hơn image backbone

### 8.4. Hướng tốt nhất cho `S`

Ngắn hạn:

- giữ expert riêng
- tăng hard negative y tế / wound / surgery
- ưu tiên image backbone hoặc image encoder riêng nếu dữ liệu chủ yếu là ảnh

Trung hạn:

- thử late fusion
- thử KD sau

### 8.5. Hướng hệ thống chung

Cho demo và vận hành:

- giữ V6.1 làm baseline chính cho `V`
- `N` và `S` nên có nhánh riêng nếu dữ liệu không có temporal signal thật

Cho nghiên cứu:

- tách thành các nhánh ablation riêng:
  - `V-only`
  - `N-only`
  - `S-only`
  - `gate + KD`
  - `gate không KD`
  - `image backbone cho N/S`
  - `video backbone chỉ cho V`

Ý chính là:

- không ép 3 task phải chung một lời giải ngay từ đầu
- vì mỗi task có độ khó, loại nhãn và cả loại dữ liệu khác nhau
- video backbone chỉ nên dùng nơi thật sự có tín hiệu thời gian

### 8.6. Phương án giải quyết tổng thể

Nếu phải chốt một phương pháp để giải bài toán hiện tại, thì nên chọn chiến lược sau:

1. Tách bài toán theo bản chất dữ liệu.
   - `Violence (V)`: dùng nhánh video thật, vì đây là task có tín hiệu thời gian thật.
   - `NSFW (N)` và `Self-harm (S)`: dùng nhánh ảnh tĩnh hoặc image backbone riêng, vì dữ liệu hiện tại không đủ temporal signal để ép vào VideoMAE một cách an toàn.

2. Không dùng một backbone chung cho cả 3 task khi dữ liệu không cùng loại.
   - Video backbone chỉ dành cho nơi có động học theo thời gian thật.
   - Ảnh tĩnh không nên bị “giả video hóa” chỉ để cho vừa kiến trúc.

3. Dùng late fusion ở tầng quyết định, không fusion quá sớm.
   - Mỗi nhánh sinh ra score riêng.
   - Sau đó mới ghép score bằng rule, weighted sum, hoặc meta-classifier nhẹ.
   - Cách này giữ được ưu điểm của từng nhánh và giảm rủi ro hallucination.

4. Chỉ dùng KD trong cùng miền dữ liệu hoặc cùng loại biểu diễn.
   - Video teacher dạy video student.
   - Image teacher dạy image student.
   - Không mặc định dùng image teacher để dạy video student nếu domain shift quá lớn.

5. Calibrate riêng từng task.
   - `V`, `N`, `S` phải có threshold riêng.
   - Không dùng chung một ngưỡng hay một luật flag cho cả 3.

Nói gọn lại:

- `V` đi theo `video-native supervised branch`
- `N/S` đi theo `image-native expert branch`
- hợp nhất ở mức `late fusion + calibration`, không ép chung một backbone

Đây là cách an toàn hơn, khoa học hơn, và khớp với dữ liệu hiện tại hơn so với việc cố nhét cả 3 task vào `VideoMAE`.

## 9. Kế hoạch ablation nên làm trước khi code tiếp

### Mốc A - V6.1 hiện tại

Đây là baseline chuẩn.

Mọi thay đổi mới đều phải so với mốc này.

### Mốc B - V7 chỉ train Violence

Mục tiêu:

- kiểm tra VideoMAE có thực sự giải shortcut không

Nếu `V-only` không tốt hơn V6:

- chưa nên mở rộng sang `S/N`
- nếu `N/S` là ảnh tĩnh, nên chuyển qua image backbone trước khi thử lại KD hay video backbone

### Mốc C - `S/N` không KD

Mục tiêu:

- xem expert + pooling + calibration đã đủ chưa
- so sánh trực tiếp image backbone với video backbone giả trên `N/S`

### Mốc D - `S/N` có KD

Mục tiêu:

- xem KD có thật sự giúp hơn không

### Mốc E - hệ thống cuối

Sau khi có số liệu:

- `V` chọn phương án tốt nhất
- `N` chọn phương án ổn định nhất
- `S` chọn phương án ít false positive nhất

## 10. Kết luận ngắn

- V6.1 hiện vẫn là baseline đáng tin nhất.
- V7 có ý tưởng đúng hướng, nhưng chưa đủ số để thay baseline.
- `Gate` là cơ chế định tuyến tín hiệu, không phải score.
- `Score` là đầu ra cuối cùng sau gate.
- `KD` có lý do tồn tại, đặc biệt với `S/N`, nhưng không nên dùng vội cho cả 3 task.
- Hướng đi đúng là ablation rõ ràng, tách từng task ra kiểm tra, rồi mới quyết định có ghép lại hay không.
- Với dữ liệu hiện tại, việc ép chung một `VideoMAE` cho `V + N + S` là không còn an toàn; `V` nên video-native, còn `N/S` nên ưu tiên image backbone hoặc nhánh riêng nếu không có temporal signal thật.
