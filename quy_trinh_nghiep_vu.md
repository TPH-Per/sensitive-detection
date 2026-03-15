**ĐẶC TẢ QUY TRÌNH NGHIỆP VỤ VÀ CHỨC NĂNG HỆ THỐNG**

---

Ứng dụng mạng xã hội phục vụ hai nhóm tác nhân chính:

* **Người dùng thông thường:** Thực hiện các hoạt động mạng xã hội bao gồm xác thực, đăng bài viết, kết bạn, nhắn tin, gọi điện/video, tương tác với nội dung và gửi báo cáo vi phạm.  
* **Quản trị viên (Admin):** Quản lý tài khoản người dùng và xử lý báo cáo vi phạm nội dung.

![][image1]

*Usecase tổng quát của hệ thống*

---

1. # **Quy trình Đăng ký và Đăng nhập**

Người dùng có thể khởi tạo tài khoản mới bằng cách cung cấp họ tên, địa chỉ email và thiết lập mật khẩu an toàn. Hệ thống thực hiện kiểm tra tính hợp lệ của dữ liệu định dạng và bắt buộc người dùng xác thực email thông qua liên kết hệ thống tự động gửi trước khi có thể truy cập đầy đủ. Đối với người dùng đã có tài khoản, họ sử dụng email và mật khẩu để đăng nhập vào hệ thống.

Trong quá trình này, hệ thống bảo mật sẽ từ chối các yêu cầu truy cập từ những tài khoản đã bị quản trị viên khóa chặn hoặc thông tin đăng nhập không chính xác. Khi không cung cấp đúng mật khẩu, người dùng có thể kích hoạt tính năng khôi phục, hệ thống sẽ gửi một liên kết cấp phép đặt lại mật khẩu an toàn trực tiếp đến hộp thư đã ghi nhận của họ.

---

2. # **Quy trình Quản lý Hồ sơ Cá nhân**

Người dùng có thể cá nhân hóa tài khoản bằng cách cập nhật thông tin giới thiệu cơ bản như ảnh đại diện, ảnh bìa, ngày sinh, giới tính và nơi sinh sống. Hệ thống cho phép người dùng xem lại toàn bộ lịch sử bài viết và hình ảnh mà họ đã đăng tải trên dòng thời gian cá nhân. Ngoài ra, người dùng có thể điều chỉnh các thiết lập quyền riêng tư cụ thể, bao gồm việc ẩn trạng thái hoạt động trực tuyến, tắt thông báo đã xem tin nhắn và cấu hình quyền mặc định cho các bài đăng mới. Các thay đổi về quyền riêng tư sẽ ngay lập tức được hệ thống ghi nhận và áp dụng xuyên suốt đối với các tài khoản kết nối khác.

1. ## ***Xem và chỉnh sửa thông tin cá nhân***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-HS01 |
| Tên use case | Chỉnh sửa thông tin cá nhân |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng xem và cập nhật các thông tin trên trang hồ sơ cá nhân của mình |
| Điều kiện tiên quyết | Người dùng đã đăng nhập |
| Điều kiện sau | Thông tin cá nhân được cập nhật và hiển thị ngay trên trang hồ sơ |

**Luồng sự kiện chính:**

1. Người dùng truy cập trang cá nhân và lựa chọn chỉnh sửa hồ sơ.  
2. Hệ thống kiểm tra tính hợp lệ của dữ liệu nhập vào.  
3. Hệ thống lưu thay đổi và cập nhật thông tin hiển thị trên trang hồ sơ ngay lập tức.

**Luồng thay thế:**

* \[A1\] Bước 2 — Dữ liệu không hợp lệ (họ tên rỗng, định dạng ngày sinh sai...): hệ thống hiển thị thông báo lỗi tại trường tương ứng, không lưu thay đổi.

  2. ## ***Cập nhật ảnh đại diện/ảnh bìa***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-HS02 |
| Tên use case | Cập nhật ảnh đại diện/ảnh bìa |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng tải lên ảnh mới từ thiết bị để cập nhật ảnh hồ sơ |
| Điều kiện tiên quyết | Người dùng đã đăng nhập |
| Điều kiện sau | Ảnh mới được cập nhật trên toàn hệ thống; tùy chọn cho phép đăng bài viết thông báo thay đổi ảnh xuất hiện trên trang cá nhân |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu cập nhật ảnh đại diện/ảnh bìa.  
2. Người dùng tải ảnh lên hệ thống.  
3. Hệ thống kiểm tra định dạng và kích thước tệp.  
4. Hệ thống lưu ảnh mới, cập nhật ảnh đại diện trên toàn hệ thống.

Người dùng tùy chọn để hệ thống tự động tạo bài viết thông báo trên trang cá nhân của người dùng

**Luồng thay thế:**

* \[A1\] Bước 4 — Tệp không đúng định dạng hoặc vượt quá kích thước cho phép: hệ thống hiển thị thông báo lỗi, yêu cầu người dùng chọn lại tệp khác.

![][image2]

*Sơ đồ hoạt động \- Cập nhật ảnh đại diện/ảnh bìa*

![][image3]

*Sơ đồ tuần tự \- Chỉnh sửa hồ sơ cá nhân*

3. # **Quy trình Quản lý Kết bạn**

Hệ thống cho phép người dùng gửi tìm kiếm chính xác bằng email và gửi lời mời kết bạn để thiết lập kết nối xã hội mới. Lời mời chỉ được gửi đi nếu người nhận không chặn người gửi. Đối phương có thể chấp nhận để trở thành bạn bè hoặc từ chối.

Trong giai đoạn chờ, người gửi có quyền rút lại lời mời đã gửi bất cứ lúc nào. Khi đã là bạn bè, cả hai bên đều có thể chủ động hủy kết bạn để gỡ bỏ mối quan hệ. Hệ thống tự động cập nhật trạng thái đồng bộ cho cả hai tài khoản và đảm bảo tính riêng tư khi không thông báo cho bên bị hủy kết bạn.

Mối quan hệ giữa hai người dùng trải qua bốn trạng thái:

| Trạng thái | Mô tả |
| :---- | :---- |
| Chưa kết bạn | Hai người chưa có mối quan hệ |
| Chờ phản hồi (đã gửi) | Người dùng đã gửi lời mời, chờ đối phương |
| Chờ phản hồi (đã nhận) | Người dùng nhận được lời mời từ người khác |
| Bạn bè | Hai người đã kết bạn thành công |

1. ## ***Gửi lời mời kết bạn***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-KB01 |
| Tên use case | Gửi lời mời kết bạn |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng gửi lời mời kết bạn đến một người dùng khác |
| Điều kiện tiên quyết | Người dùng đã đăng nhập; người nhận tồn tại và chưa có mối quan hệ kết bạn với người gửi |
| Điều kiện sau | Trạng thái mối quan hệ chuyển sang "Chờ phản hồi"; người nhận nhận được thông báo lời mời kết bạn |

**Luồng sự kiện chính:**

1. Người dùng tìm kiếm và truy cập trang cá nhân để kết bạn.  
2. Hệ thống kiểm tra trạng thái mối quan hệ hiện tại giữa hai người dùng.  
3. Hệ thống lưu lời mời, cập nhật trạng thái thành "Chờ phản hồi (đã gửi)" với người gửi và "Chờ phản hồi (đã nhận)" với người nhận.  
4. Hệ thống gửi thông báo đến người nhận để xem xét lời mời

**Luồng thay thế:**

4. \[A1\] Bước 2 — Hai người đã là bạn bè: hệ thống không thực hiện thao tác, hiển thị trạng thái "Bạn bè".  
5. \[A2\] Bước 2 — Người dùng đã gửi lời mời trước đó chưa được phản hồi: hệ thống không tạo lời mời trùng lặp.  
6. \[A3\] Bước 2 — Người nhận đã gửi lời mời đến người dùng từ trước: hệ thống tự động chấp nhận lời mời đó, hai người trở thành bạn bè ngay lập tức.

   1. ## ***Phản hồi lời mời kết bạn***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-KB02 |
| Tên use case | Phản hồi lời mời kết bạn |
| Tác nhân | Người dùng đã đăng nhập (người nhận lời mời) |
| Mô tả | Người dùng chấp nhận hoặc từ chối lời mời kết bạn từ người khác |
| Điều kiện tiên quyết | Người dùng đã đăng nhập; lời mời kết bạn tồn tại ở trạng thái "Chờ phản hồi (đã nhận)" |
| Điều kiện sau | Lời mời được xử lý và biến mất khỏi danh sách chờ phản hồi |

**Luồng sự kiện chính:**

1. Người dùng xem danh sách lời mời kết bạn đã nhận.  
2. Người dùng chọn một trong hai thao tác: **Chấp nhận** hoặc **Từ chối**.  
3. \[Nếu chấp nhận\] Hệ thống cập nhật trạng thái mối quan hệ thành "Bạn bè" cho cả hai phía; gửi thông báo đến người gửi lời mời.  
4. \[Nếu từ chối\] Hệ thống xóa lời mời, cập nhật trạng thái về "Chưa kết bạn"; người gửi không nhận được thông báo.

**Luồng thay thế:**

* \[A1\] Bước 4 — Người dùng nhấn Hủy trong hộp thoại xác nhận: hệ thống đóng hộp thoại, lời mời không thay đổi.  
* \[A2\] Bước 2 — Lời mời đã bị người gửi rút lại trước đó: hệ thống hiển thị thông báo lời mời không còn tồn tại, xóa lời mời khỏi danh sách.

  2. ## ***Hủy lời mời / Hủy kết bạn***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-KB04 |
| Tên use case | Hủy lời mời / Hủy kết bạn |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng rút lại lời mời kết bạn đã gửi hoặc gỡ bỏ mối quan hệ bạn bè hiện có |
| Điều kiện tiên quyết | Người dùng đã đăng nhập; mối quan hệ đang ở trạng thái "Chờ phản hồi (đã gửi)" hoặc "Bạn bè" |
| Điều kiện sau | Trạng thái mối quan hệ trở về "Chưa kết bạn" cho cả hai phía; người nhận không nhận được thông báo |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu **"Hủy lời mời"** hoặc **"Hủy kết bạn"** tùy theo trạng thái hiện tại.  
2. \[Nếu hủy lời mời\] Hệ thống xóa lời mời đang chờ phản hồi.  
3. \[Nếu hủy kết bạn\] Hệ thống xóa mối quan hệ bạn bè của cả hai phía.

   

![][image4]

*Sơ đồ hoạt động \- gửi lời mời kết bạn*

![][image5]

*Sơ đồ tuần tự \- Gửi lời mời kết bạn*

7. # **Quy trình Quản lý Bài viết**

Người dùng có thể đăng bài viết mới với nội dung linh hoạt, bao gồm văn bản và nhiều tệp hình ảnh hoặc video cùng lúc. Hệ thống hỗ trợ phân loại quyền riêng tư (Công khai, Bạn bè, Riêng tư) để kiểm soát đối tượng xem ngay từ bước khởi tạo. Bảng tin được xây dựng trên cơ chế fan-out, giúp tự động cập nhật các bài viết mới nhất từ bạn bè và bản thân theo thứ tự thời gian, đồng thời loại bỏ nội dung từ các tài khoản đã bị khóa.

Trong quá trình sử dụng, tác giả có quyền xóa bài viết hoặc chỉnh sửa nội dung, thay đổi tệp đính kèm hoặc điều chỉnh lại mức độ hiển thị. Ngoài ra, người xem có thể tương tác nhanh thông qua hệ thống cảm xúc, với số lượng tương tác và thông báo được cập nhật tự động đến chủ bài viết. Các bài viết từ tài khoản bị khóa hoặc bị chặn sẽ không hiển thị trên giao diện người xem.

1. ## ***Đăng bài viết mới***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-BV01 |
| Tên use case | Đăng bài viết mới |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng soạn và đăng bài viết lên hệ thống, có thể kèm hình ảnh hoặc video và chọn mức độ hiển thị |
| Điều kiện tiên quyết | Người dùng đã đăng nhập |
| Điều kiện sau | Bài viết xuất hiện trên trang cá nhân và bảng tin của người dùng; hiển thị đúng theo mức độ đã chọn |

**Luồng sự kiện chính:**

1. Người dùng đăng bài viết mới.  
2. Hệ thống kiểm tra nội dung không rỗng (văn bản hoặc tệp đính kèm).  
3. Hệ thống lưu bài viết và hiển thị lên trang cá nhân cùng bảng tin theo đúng mức độ hiển thị đã chọn.  
4. \[Nếu kèm ảnh/video\] Hệ thống thực hiện kiểm duyệt nội dung tự động.

   → Phát hiện nhạy cảm: Nội dung ảnh/video bị làm mờ kèm tùy chọn xem ảnh gốc.

   → Không phát hiện: Ảnh/video hiển thị ở trạng thái bình thường.

**Luồng thay thế:**

* \[A1\] Bước 2 — Nội dung không hợp lệ: Hệ thống không cho phép người dùng đăng bài

![][image6]

*Sơ đồ hoạt động \- đăng bài viết*

2. ## ***Chỉnh sửa bài viết***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-BV03 |
| Tên use case | Chỉnh sửa bài viết |
| Tác nhân | Tác giả bài viết |
| Mô tả | Người dùng chỉnh sửa nội dung, tệp đính kèm hoặc mức độ hiển thị của bài viết do mình đăng |
| Điều kiện tiên quyết | Người dùng đã đăng nhập; bài viết tồn tại và thuộc quyền sở hữu của người dùng |
| Điều kiện sau | Bài viết được cập nhật và hiển thị với nội dung mới |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu chỉnh sửa bài viết của mình  
2. Người dùng thay đổi một hoặc nhiều thành phần: nội dung văn bản, hình ảnh/video, mức độ hiển thị.  
3. Hệ thống kiểm tra nội dung hợp lệ.  
4. Hệ thống lưu thay đổi và cập nhật hiển thị ngay lập tức.  
5. \[Nếu ảnh/video thay đổi\] Hệ thống thực hiện kiểm duyệt nội dung tự động.

   → Phát hiện nhạy cảm: Nội dung ảnh/video bị làm mờ kèm tùy chọn xem ảnh gốc.

   → Không phát hiện: Ảnh/video hiển thị ở trạng thái bình thường.

**Luồng thay thế:**

* \[A1\] Bước 3 — Nội dung không hợp lệ: Hệ thống không cho phép người dùng đăng bài

  ![][image7]

*Sơ đồ hoạt động \- chỉnh sửa bài viết*

3. ## ***Xóa bài viết***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-BV04 |
| Tên use case | Xóa bài viết |
| Tác nhân | Tác giả bài viết |
| Mô tả | Người dùng xóa hoàn toàn bài viết do mình đăng |
| Điều kiện tiên quyết | Người dùng đã đăng nhập; bài viết tồn tại và thuộc quyền sở hữu của người dùng |
| Điều kiện sau | Bài viết và các nội dung liên quan bị ẩn khỏi hệ thống |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu xóa bài viết của mình.  
2. Hệ thống xác nhận yêu cầu và ẩn bài viết và toàn bộ các nội dung liên quan khỏi hệ thống.  
3. Bài viết biến mất khỏi trang cá nhân và bảng tin ngay lập tức.

   ![][image8]

*Sơ đồ hoạt động \- xóa bài viết*

4. ## ***Bày tỏ cảm xúc với bài viết***

| Trường | Nội dung |
| :---- | :---- |
| Mã use case | UC-BV05 |
| Tên use case | Bày tỏ cảm xúc với bài viết |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng chọn một biểu tượng cảm xúc để phản hồi bài viết |
| Điều kiện tiên quyết | Bài viết tồn tại và hiển thị với người dùng |
| Điều kiện sau | Cảm xúc của người dùng được ghi nhận trên bài viết; chủ bài viết nhận được thông báo. Nếu chọn lại cảm xúc đang giữ, phản ứng bị gỡ bỏ |

**Luồng sự kiện chính:**

1. Người dùng bày tỏ cảm xúc vào bài viết.  
2. Hệ thống kiểm tra trạng thái cảm xúc hiện tại của người dùng với bài viết đó.  
3. Hệ thống lưu cảm xúc mới, cập nhật số lượng hiển thị trên bài viết ngay lập tức.  
4. Hệ thống gửi thông báo đến chủ bài viết.

**Luồng thay thế:**

* \[A1\] Bước 2 — Người dùng đang giữ một cảm xúc khác: hệ thống thay thế cảm xúc cũ bằng cảm xúc mới, gửi thông báo đến chủ bài viết.

* \[A2\] Bước 2 — Người dùng chọn lại đúng cảm xúc đang giữ: hệ thống gỡ bỏ phản ứng, cập nhật số lượng, không gửi thông báo.

![][image9]

*Sơ đồ hoạt động \- thả cảm xúc*

*![][image10]*

            *Sơ tuần tự \- đăng bài viết*

8. # **Quy trình Bình luận**

Người dùng có thể để lại bình luận gốc dưới bài viết hoặc phản hồi vào bình luận của người khác. Mỗi bình luận cho phép viết nội dung văn bản kèm theo một hình ảnh. Hệ thống tự động làm mờ hình ảnh nếu phát hiện nội dung nhạy cảm và cho phép người dùng nhấn vào để xem ảnh gốc.

Người dùng có thể bày tỏ cảm xúc để tương tác với bình luận. Tác giả có quyền chỉnh sửa nội dung hoặc xóa bỏ bình luận của mình. Khi bình luận gốc bị xóa, các phản hồi liên quan cũng sẽ bị gỡ bỏ. Các bình luận từ tài khoản bị khóa hoặc bị chặn sẽ không hiển thị trên giao diện người xem.

1. ## ***Viết bình luận***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-BL01 |
| Tên use case	 | Viết bình luận |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng đăng bình luận lên một bài viết |
| Điều kiện tiên quyết	 | Người dùng đã đăng nhập; bài viết tồn tại và hiển thị với người dùng |
| Điều kiện sau | Bình luận xuất hiện trên bài viết; số lượng bình luận tăng thêm 1; chủ bài viết nhận thông báo. Nếu bình luận kèm ảnh, hệ thống tự động kiểm duyệt và làm mờ nếu phát hiện nội dung nhạy cảm |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu đăng bình luận lên bài viết.  
2. Hệ thống xác thực nội dung bình luận.  
3. Hệ thống lưu trữ dữ liệu, cập nhật số lượng tương tác trên bài viết.  
4. Bình luận được hiển thị công khai; hệ thống gửi thông báo đến chủ bài viết.  
5. \[Nếu kèm ảnh\] Hệ thống thực hiện kiểm duyệt nội dung tự động.

   → Phát hiện nhạy cảm: Nội dung ảnh bị làm mờ kèm tùy chọn xem ảnh gốc.

   → Không phát hiện: Ảnh hiển thị ở trạng thái bình thường.

**Luồng thay thế:**

* **\[A1\]** Bước 1 — Nội dung rỗng: Hệ thống từ chối ghi nhận yêu cầu.

![][image11]

*Sơ đồ hoạt động \- Viết bình luận*

![][image12]

*Sơ đồ tuần tự \- Viết bình luận*

2. ## ***Phản hồi bình luận***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-BL02 |
| Tên use case	 | Phản hồi bình luận |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng phản hồi trực tiếp vào một bình luận gốc |
| Điều kiện tiên quyết	 | Bình luận gốc tồn tại |
| Điều kiện sau | Phản hồi hiển thị bên dưới bình luận gốc; tác giả bình luận gốc nhận thông báo. Nếu phản hồi kèm ảnh, hệ thống tự động kiểm duyệt và làm mờ nếu phát hiện nội dung nhạy cảm |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu phản hồi một bình luận cụ thể.  
2. Hệ thống xác định đối tượng nhận phản hồi.  
3. Người dùng cung cấp nội dung phản hồi.  
4. Hệ thống lưu trữ dữ liệu, cập nhật số đếm phản hồi trên bình luận gốc.  
5. Phản hồi được hiển thị; hệ thống gửi thông báo đến tác giả bình luận gốc.  
6. \[Nếu kèm ảnh\] Hệ thống thực hiện kiểm duyệt nội dung tự động.

   → Phát hiện nhạy cảm: Nội dung ảnh bị làm mờ kèm tùy chọn xem ảnh gốc.

   → Không phát hiện: Ảnh hiển thị ở trạng thái bình thường.

**Luồng thay thế:**

* **\[A1\]** Bước 1 — Nội dung rỗng: Hệ thống từ chối ghi nhận yêu cầu.

**![][image13]**

*Sơ đồ hoạt động \- Phản hồi bình luận*

**![][image14]**

*Sơ đồ tuần tự \- Phản hồi bình luận*

3. ## ***Chỉnh sửa / Xóa bình luận***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-BL03 |
| Tên use case	 | Chỉnh sửa hoặc Xóa bình luận |
| Tác nhân	 | Tác giả bình luận |
| Mô tả	 | Người dùng chỉnh sửa toàn bộ nội dung (text và/hoặc ảnh) hoặc xóa bình luận của mình |
| Điều kiện tiên quyết	 | Người dùng là tác giả của bình luận |
| Điều kiện sau | Bình luận được cập nhật hoặc bị xóa cùng toàn bộ phản hồi con. Nếu chỉnh sửa có thay ảnh mới, hệ thống tự động kiểm duyệt ảnh đó |

**Luồng chính – Chỉnh sửa:**

1. Người dùng yêu cầu cập nhật nội dung bình luận đã đăng.  
2. Hệ thống xác thực quyền sở hữu và nội dung mới (văn bản hoặc hình ảnh).  
3. Hệ thống cập nhật dữ liệu bình luận.  
4. \[Nếu ảnh thay đổi\] Hệ thống thực hiện kiểm duyệt nội dung tự động.

   → Phát hiện nhạy cảm: Nội dung ảnh bị làm mờ kèm tùy chọn xem ảnh gốc.

   → Không phát hiện: Ảnh hiển thị ở trạng thái bình thường.

**Luồng chính – Xóa:**

1. Người dùng yêu cầu gỡ bỏ bình luận của mình.  
2. Hệ thống xác thực yêu cầu và thực hiện xóa dữ liệu.  
3. Hệ thống xóa bình luận, toàn bộ phản hồi con và cập nhật số lượng tương tác liên quan.

**![][image15]**

*Sơ đồ hoạt động \- Chỉnh sửa / Xóa bình luận*

*![][image16]*

*Sơ đồ tuần tự \- Chỉnh sửa / Xóa bình luận*

---

9. # **Quy trình Nhắn tin**

Người dùng có thể bắt đầu trò chuyện 1-1 hoặc tạo nhóm chat với phạm vi tối đa là 100 thành viên. Khi nhắn tin, hệ thống cho phép gửi đa dạng nội dung từ văn bản, hình ảnh, video đến các tệp đính kèm và tin nhắn thoại. Người dùng có thể theo dõi trạng thái tin nhắn từ lúc gửi đi cho đến khi đối phương đã xem, cùng trạng thái hoạt động trực tuyến của bạn bè.

Trong cuộc trò chuyện, người dùng có thể thu hồi, chỉnh sửa tin nhắn văn bản, chuyển tiếp nội dung cho người khác và xóa(ở phía mình). Đối với tin nhắn từ người lạ, hệ thống sẽ đưa vào mục chờ riêng để đảm bảo tính riêng tư. Với nhóm chat, người dùng có thể phân quyền quản trị viên, thêm thành viên mới hoặc rời nhóm khi cần thiết. Để quản lý danh sách hội thoại, người dùng có tùy chọn xóa hội thoại, ghim các cuộc trò chuyện quan trọng, tắt thông báo hoặc lưu trữ các hội thoại cũ.

| Loại | Mô tả |
| :---- | :---- |
| Văn bản | Nội dung chữ Hỗ trợ đề cập (@mention) thành viên (dành cho chat nhóm) |
| Hình ảnh | Gửi ảnh từ thiết bị |
| Video | Gửi tệp video |
| Tệp đính kèm | Gửi tài liệu và các định dạng tệp khác |
| Tin nhắn thoại | Ghi âm và gửi ngay trong ứng dụng |
| Emoji | Các biểu tượng cảm xúc	 |

*Bảng các loại tin nhắn*

Mỗi lần gửi hỗ trợ đính kèm tối đa **10 tệp** cùng lúc. 

1. ## ***Quản lý tin nhắn***

   1. ### ***Gửi tin nhắn***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT01 |
| Tên use case	 | Gửi tin nhắn |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả | Người dùng gửi tin nhắn trong cuộc trò chuyện 1-1 hoặc nhóm |
| Điều kiện tiên quyết	 | Cuộc trò chuyện đã tồn tại; hai bên không chặn nhau |
| Điều kiện sau | Tin nhắn hiển thị; người nhận nhận thông báo |

**Luồng sự kiện chính:**

1. Người dùng mở cuộc trò chuyện và gửi tin nhắn.  
2. Hệ thống xác thực nội dung tin nhắn.  
3. Hệ thống lưu trữ tin nhắn và cập nhật dữ liệu hội thoại.  
4. Trạng thái tin nhắn được cập nhật theo tiến trình gửi, nhận và xem của đối phương.

**Luồng thay thế:**

* **\[A2\]** Bước 3 — Nội dung không hợp lệ: hệ thống thông báo lỗi, không gửi.

![][image17]

*Sơ đồ hoạt động \- Gửi tin nhắn*

![][image18]

*Sơ đồ tuần tự \- Gửi tin nhắn*

2. ### ***Thu hồi tin nhắn***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT02 |
| Tên use case	 | Thu hồi tin nhắn |
| Tác nhân	 | Người gửi tin nhắn |
| Mô tả	 | Người gửi thu hồi tin nhắn đã gửi |
| Điều kiện tiên quyết	 | Người dùng là tác giả tin nhắn đó |
| Điều kiện sau | Nội dung thay bằng "*Tin nhắn đã thu hồi*" với tất cả thành viên trong cuộc trò chuyện |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu thu hồi tin nhắn đã gửi.  
2. Hệ thống xác thực quyền sở hữu đối với tin nhắn đó.  
3. Hệ thống thực hiện chuyển đổi nội dung tin nhắn sang trạng thái "Tin nhắn đã thu hồi" cho tất cả thành viên trong cuộc trò chuyện.

**Luồng ngoại lệ:**

* **\[E1\]** Không phải tác giả: tùy chọn Thu hồi không hiển thị.

**![][image19]**

**![][image20]**

3. ### ***Chỉnh sửa tin nhắn***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT03 |
| Tên use case	 | Chỉnh sửa tin nhắn |
| Tác nhân	 | Người gửi tin nhắn |
| Mô tả	 | Người gửi chỉnh sửa nội dung tin nhắn văn bản trong thời gian quy định |
| Điều kiện tiên quyết	 | Là tác giả; tin nhắn là loại văn bản; chưa quá thời gian quy định kể từ khi gửi |
| Điều kiện sau | Tin nhắn hiển thị nội dung mới |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu chỉnh sửa nội dung tin nhắn văn bản.  
2. Hệ thống xác thực quyền tác giả và kiểm tra giới hạn thời gian.  
3. Người dùng cung cấp nội dung chỉnh sửa.  
4. Hệ thống cập nhật và hiển thị nội dung mới của tin nhắn.

**Luồng thay thế:**

* **\[A1\]** Bước 2 — Quá thời gian: tùy chọn **Chỉnh sửa** bị ẩn.

**![][image21]**

**![][image22]**

4. ### ***Trả lời tin nhắn***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT04 |
| Tên use case	 | Trả lời tin nhắn |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng phản hồi liên kết với một tin nhắn cụ thể trong cuộc trò chuyện |
| Điều kiện tiên quyết	 | Tin nhắn gốc tồn tại trong cuộc trò chuyện |
| Điều kiện sau | Tin nhắn phản hồi hiển thị kèm trích dẫn tin nhắn gốc |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu phản hồi liên kết với một tin nhắn cụ thể.  
2. Người dùng cung cấp nội dung phản hồi.  
3. Hệ thống xác lập liên kết dữ liệu giữa tin nhắn mới và tin nhắn gốc.  
4. Tin nhắn phản hồi được hiển thị kèm thông tin trích dẫn từ nguồn gốc.

**![][image23]**

**![][image24]**

5. ### ***Chuyển tiếp tin nhắn***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT05 |
| Tên use case	 | Chuyển tiếp tin nhắn |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng chuyển một tin nhắn sang cuộc trò chuyện khác |
| Điều kiện tiên quyết	 | Người dùng có ít nhất một cuộc trò chuyện khác để chuyển đến |
| Điều kiện sau | Tin nhắn xuất hiện tại cuộc trò chuyện đích |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu chuyển tiếp tin nhắn.  
2. Người dùng xác định các cuộc trò chuyện đích để chuyển dữ liệu đến.  
3. Hệ thống tạo bản sao tin nhắn tại các hội thoại được chọn và đánh dấu nguồn gốc chuyển tiếp.

**![][image25]**

**![][image26]**

6. ### ***Cảm xúc tin nhắn***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT06 |
| Tên use case	 | Cảm xúc tin nhắn |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng phản hồi cảm xúc trên một tin nhắn cụ thể |
| Điều kiện tiên quyết	 | Tin nhắn tồn tại và chưa bị thu hồi |
| Điều kiện sau | Cảm xúc hiển thị trên tin nhắn; có thể thay đổi hoặc gỡ bỏ |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu bày tỏ cảm xúc trên một tin nhắn cụ thể.  
2. Hệ thống xác thực trạng thái phản hồi hiện tại của người dùng trên tin nhắn đó.  
3. Hệ thống thực hiện đính kèm, thay đổi hoặc gỡ bỏ cảm xúc phản hồi tương ứng.

**Luồng thay thế:**

* **\[A1\]** Chưa react → Thêm cảm xúc vào tin nhắn.  
* **\[A2\]** Đã react cùng loại → Gỡ bỏ cảm xúc.  
* **\[A3\]** Đã react khác loại → Cập nhật sang cảm xúc mới.

**![][image27]**

**![][image28]**

7. ### ***Xóa tin nhắn phía mình***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT07 |
| Tên use case	 | Xóa tin nhắn phía mình |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng ẩn tin nhắn khỏi giao diện của riêng mình, không ảnh hưởng đến phía người khác |
| Điều kiện tiên quyết	 | Tin nhắn tồn tại trong cuộc trò chuyện |
| Điều kiện sau | Tin nhắn ẩn khỏi giao diện người dùng; các thành viên khác vẫn thấy bình thường |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu ẩn tin nhắn khỏi giao diện cá nhân.  
2. Hệ thống xác thực và cập nhật trạng thái hiển thị của dữ liệu đối với tài khoản yêu cầu.  
3. Nội dung tin nhắn của các thành viên khác trong hội thoại không bị ảnh hưởng.

![][image29]

![][image30]

10. ## ***Quản lý nhóm chat***

Hệ thống cho phép người dùng khởi tạo cuộc trò chuyện hội nhóm với tối đa 100 thành viên. Trong quá trình vận hành, người dùng có thể cập nhật thông tin nhận diện bao gồm tên nhóm và ảnh đại diện. Quản trị viên thực hiện việc kiểm soát số lượng thành viên thông qua thao tác thêm mới hoặc loại bỏ tài khoản khỏi nhóm. Chủ nhóm có quyền gán hoặc thu hồi vai trò quản trị cho các thành viên khác để hỗ trợ quản lý. Thành viên có thể chủ động rời nhóm, riêng đối với chủ nhóm sẽ có thêm quyền giải tán để dừng hoạt động của toàn bộ nhóm chat và gỡ bỏ dữ liệu liên quan khi không còn nhu cầu sử dụng.

1. ### ***Tạo nhóm chat***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT08 |
| Tên use case	 | Tạo nhóm chat |
| Tác nhân	 | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng tạo một cuộc trò chuyện nhóm mới |
| Điều kiện tiên quyết	 | Chọn số lượng thành viên trong phạm vi được quy định |
| Điều kiện sau | Nhóm được tạo; tin nhắn hệ thống xuất hiện; tất cả thành viên thấy nhóm |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu khởi tạo một cuộc trò chuyện nhóm mới.  
2. Người dùng xác định danh sách thành viên tham gia.  
3. Hệ thống xác thực số lượng thành viên và điều kiện nhóm.  
4. Hệ thống khởi tạo nhóm và gửi tin nhắn hệ thống.

**Luồng thay thế:**

* **\[A1\]** Bước 2 — Số lượng thành viên không hợp lệ: Hệ thống từ chối yêu cầu khởi tạo và thông báo giới hạn

**![][image31]**

**![][image32]**

2. ### ***Thêm / Xóa thành viên***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT09 |
| Tên use case	 | Thêm / Xóa thành viên nhóm |
| Tác nhân	 | Quản trị viên hoặc Chủ nhóm |
| Mô tả	 | Người dùng thêm/xóa thành viên trong nhóm |
| Điều kiện tiên quyết	 | Người dùng có vai trò Quản trị viên hoặc Chủ nhóm |
| Điều kiện sau | Danh sách thành viên cập nhật |

**Luồng sự kiện chính – Thêm:**

1. Quản trị viên yêu cầu bổ sung thành viên vào nhóm.  
2. Hệ thống xác thực nhóm chưa đạt giới hạn.  
3. Quản trị viên xác định danh sách người dùng cần bổ sung.  
4. Hệ thống cập nhật danh sách thành viên và gửi thông báo hệ thống.

**Luồng sự kiện chính – Xóa:**

1. Quản trị viên yêu cầu loại bỏ một thành viên khỏi nhóm.  
2. Hệ thống thực hiện cập nhật danh sách và gửi thông báo hệ thống.

**Luồng thay thế:**

* **\[A1\]** Thêm — Nhóm đạt giới hạn: hệ thống từ chối, hiển thị thông báo giới hạn.

**Luồng ngoại lệ:**

* **\[E1\]** Không phải Quản trị viên/Chủ nhóm: tùy chọn không hiển thị.

*![][image33]*

*![][image34]*

3. ### ***Gán / Thu hồi quyền Quản trị viên***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT10 |
| Tên use case	 | Gán / Thu hồi quyền Quản trị viên |
| Tác nhân	 | Quản trị viên hoặc Chủ nhóm |
| Mô tả | Người dùng gán hoặc thu hồi quyền Quản trị viên |
| Điều kiện tiên quyết	 | Người dùng có vai trò Quản trị viên hoặc Chủ nhóm |
| Điều kiện sau | Vai trò thành viên được cập nhật; tin nhắn hệ thống thông báo |

**Luồng sự kiện chính:**

1. Quản trị viên yêu cầu thay đổi vai trò của một thành viên.  
2. Hệ thống thực hiện gán hoặc thu hồi quyền Quản trị viên tương ứng.  
3. Hệ thống cập nhật dữ liệu vai trò và gửi thông báo hệ thống.

**Luồng ngoại lệ:**

* **\[E1\]** Không phải Quản trị viên/Chủ nhóm: tùy chọn không hiển thị.

*![][image35]*

*![][image36]*

4. ### ***Rời nhóm***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT11 |
| Tên use case	 | Rời nhóm |
| Tác nhân	 | Thành viên nhóm |
| Mô tả | Người dùng rời khỏi nhóm chat |
| Điều kiện tiên quyết	 | Người dùng đang là thành viên của nhóm |
| Điều kiện sau | Người dùng rời khỏi nhóm; tin nhắn hệ thống thông báo |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu rời khỏi nhóm trò chuyện.  
2. Hệ thống kiểm tra số lượng thành viên hiện tại.  
3. **Trường hợp nhóm chỉ còn 1 thành viên:** Hệ thống thực hiện giải tán nhóm và xóa dữ liệu liên quan.  
4. **Trường hợp nhóm còn nhiều thành viên:**  
* Nếu là thành viên thông thường: Hệ thống thực hiện cập nhật trạng thái rời nhóm.  
* Nếu là Chủ nhóm: Hệ thống yêu cầu chỉ định Chủ nhóm mới trước khi phê duyệt yêu cầu rời nhóm.  
5. Hệ thống cập nhật danh sách thành viên và gửi thông báo hệ thống.

*![][image37]*

*![][image38]*

5. ### ***Giải tán nhóm***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT12 |
| Tên use case	 | Giải tán nhóm |
| Tác nhân | Chủ nhóm |
| Mô tả | Chủ phòng giải tán nhóm chat |
| Điều kiện tiên quyết | Người dùng là Chủ nhóm |
| Điều kiện sau | Nhóm và toàn bộ dữ liệu bị xóa; tất cả thành viên bị loại |

**Luồng sự kiện chính:**

1. Chủ nhóm yêu cầu giải tán nhóm trò chuyện.  
2. Hệ thống xác thực quyền hạn và thực hiện xóa toàn bộ dữ liệu nhóm cùng các liên kết liên quan.  
3. Hệ thống loại toàn bộ thành viên khỏi nhóm. (Ngoại trừ Chủ nhóm ra thì vẫn giữ cuộc hội thoại(không còn dữ liệu bên trong) trong danh sách của thành viên để thông báo giải tán nhóm cho thành viên biết)

**Luồng ngoại lệ:**

* **\[E1\]** Không phải Chủ nhóm: tùy chọn Giải tán không hiển thị.

*![][image39]*

*![][image40]*

6. ### ***Cập nhật thông tin nhóm***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT13 |
| Tên use case	 | Cập nhật thông tin nhóm |
| Tác nhân	 | Bất kỳ thành viên nào |
| Mô tả | Người dùng cập nhật các thông tin (tên nhóm / ảnh nhóm) của nhóm chat |
| Điều kiện tiên quyết	 | Người dùng đang là thành viên của nhóm |
| Điều kiện sau | Tên nhóm / ảnh được cập nhật cho tất cả thành viên |

**Luồng sự kiện chính:**

1. Thành viên yêu cầu cập nhật thông tin nhận diện của nhóm.  
2. Thành viên cung cấp tên mới hoặc ảnh đại diện mới.  
3. Hệ thống thực hiện cập nhật và đồng bộ dữ liệu cho tất cả các thành viên trong nhóm.

*![][image41]*

*![][image42]*

11. ## ***Quản lý hội thoại***

Quy trình này cung cấp các thao tác để tổ chức và sắp xếp danh sách hội thoại cá nhân. Người dùng thực hiện ghim các cuộc trò chuyện quan trọng lên đầu danh sách hoặc chuyển vào mục lưu trữ để ẩn các nội dung ít tương tác. Hệ thống hỗ trợ thay đổi thiết lập thông báo cho từng hội thoại để dừng nhận tín hiệu báo tin nhắn mới khi cần thiết. Ngoài ra, người dùng có thể điều chỉnh trạng thái hội thoại bằng cách đánh dấu đã đọc/chưa đọc hoặc sử dụng tính năng xóa để gỡ bỏ hiển thị cuộc trò chuyện khỏi giao diện cá nhân mà không làm ảnh hưởng đến dữ liệu của các thành viên khác.

1. ### ***Ghim / Bỏ ghim hội thoại***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT14 |
| Tên use case	 | Ghim / Bỏ ghim hội thoại |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng lựa chọn ghim / bỏ ghim cuộc hội thoại trong danh sách đoạn chat của họ |
| Điều kiện tiên quyết	 | — |
| Điều kiện sau | Hội thoại được ghim lên đầu hoặc trở về vị trí theo thời gian |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu thay đổi trạng thái ghim của một cuộc hội thoại.  
2. Hệ thống xác thực trạng thái hiện tại (đã ghim hoặc chưa ghim).  
3. Hệ thống cập nhật thứ tự ưu tiên hiển thị của hội thoại trong danh sách cá nhân.

**Luồng thay thế:**

* **\[A1\]** Bước 3 — Chưa ghim: hệ thống đánh dấu hội thoại là đã ghim; hội thoại được đẩy lên đầu danh sách.  
* **\[A2\]** Bước 3 — Đã ghim: hệ thống xóa trạng thái ghim; hội thoại trở về vị trí theo thứ tự thời gian.

![][image43]

![][image44]

2. ### ***Tắt / Bật thông báo hội thoại***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT15 |
| Tên use case	 | Tắt / Bật thông báo hội thoại |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng lựa chọn tắt / bật thông báo của một cuộc hội thoại trong danh sách đoạn chat của họ |
| Điều kiện tiên quyết	 | — |
| Điều kiện sau | Người dùng không nhận hoặc tiếp tục nhận thông báo từ hội thoại đó |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu thay đổi thiết lập thông báo cho một cuộc hội thoại.  
2. Hệ thống xác thực trạng thái thông báo hiện tại.  
3. Hệ thống thực hiện vô hiệu hóa hoặc kích hoạt lại các tín hiệu thông báo (âm thanh, đẩy tin) tương ứng.

**Luồng thay thế:**

* **\[A1\]** Bước 3 — Đang bật: hệ thống ghi nhận trạng thái tắt thông báo; người dùng không còn nhận thông báo từ hội thoại đó.  
* **\[A2\]** Bước 3 — Đang tắt: hệ thống xóa trạng thái tắt thông báo; người dùng nhận lại thông báo bình thường.

![][image45]

![][image46]

3. ### ***Lưu trữ / Bỏ lưu trữ hội thoại***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT16 |
| Tên use case	 | Lưu trữ / Bỏ lưu trữ hội thoại |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng lựa chọn lưu trữ một cuộc hội thoại trong danh sách đoạn chat chính của họ hoặc bỏ lưu trữ một cuộc hội thoại trong danh sách đoạn chat đã lưu trữ |
| Điều kiện tiên quyết	 | — |
| Điều kiện sau | Hội thoại ẩn khỏi danh sách chính hoặc được đưa trở lại |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu thay đổi trạng thái lưu trữ của một cuộc hội thoại.  
2. Hệ thống xác thực trạng thái lưu trữ hiện tại.  
3. Hệ thống thực hiện ẩn hội thoại khỏi danh sách chính hoặc đưa trở lại mục hiển thị mặc định.

**Luồng thay thế:**

* **\[A1\]** Bước 3 (Chưa lưu trữ): Hệ thống đánh dấu hội thoại là đã lưu trữ; hội thoại ẩn khỏi danh sách chính, chuyển vào mục Lưu trữ.  
* **\[A2\]** Bước 3 (Đã lưu trữ): Hệ thống hủy đánh dấu lưu trữ đối với hội thoại; hội thoại xuất hiện trở lại trong danh sách chính.

![][image47]

![][image48]

4. ### ***Đánh dấu chưa đọc / đã đọc***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT17 |
| Tên use case	 | Đánh dấu chưa đọc / đã đọc |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng lựa chọn đánh dấu chưa đọc / đã đọc cho một cuộc hội thoại trong danh sách đoạn chat của họ |
| Điều kiện tiên quyết	 | Hội thoại đang hiển thị trong danh sách |
| Điều kiện sau | Giao diện và trạng thái chưa đọc được bật hoặc tắt theo thao tác người dùng |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu thay đổi trạng thái đọc (đã đọc/chưa đọc) của một cuộc hội thoại.  
2. Hệ thống xác thực trạng thái hiện tại của hội thoại đối với tài khoản yêu cầu.  
3. Hệ thống cập nhật và phản ánh trạng thái mới vào dữ liệu hiển thị của người dùng.

**Luồng thay thế:**

* **\[A1\]** Bước 3 — Đang ở trạng thái đã đọc: hệ thống đánh dấu hội thoại là chưa đọc.  
* **\[A2\]** Bước 3 — Đang ở trạng thái chưa đọc: hệ thống xóa trạng thái chưa đọc.

![][image49]

![][image50]

5. ### ***Xóa hội thoại***

| Trường	 | Nội dung |
| :---- | :---- |
| Mã use case | UC-NT18 |
| Tên use case	 | Xóa hội thoại |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng lựa chọn xóa một cuộc hội thoại trong danh sách đoạn chat của họ |
| Điều kiện tiên quyết	 | Hội thoại đang hiển thị trong danh sách (chưa bị xóa trước đó) |
| Điều kiện sau | Hội thoại ẩn khỏi danh sách phía người dùng; các thành viên khác không bị ảnh hưởng |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu gỡ bỏ một cuộc hội thoại khỏi danh sách hiển thị cá nhân.  
2. Hệ thống thực hiện xác thực yêu cầu và cập nhật trạng thái hiển thị của dữ liệu.  
3. Hội thoại được ẩn khỏi danh sách của người dùng yêu cầu; dữ liệu phía các thành viên khác không bị thay đổi.  
4. Nếu sau đó có tin nhắn mới gửi đến, hội thoại tự động xuất hiện trở lại trong danh sách.

![][image51]

![][image52]

---

12. # **Quy trình Gọi điện Thoại và Video**

Người dùng có thể thực hiện cuộc gọi thoại hoặc video trong các cuộc trò chuyện 1-1 và nhóm. Khi có cuộc gọi đến, người nhận có thể chấp nhận để bắt đầu kết nối, từ chối hoặc bỏ qua nếu không tiện nghe. Sau khi cuộc gọi kết thúc, hệ thống sẽ tự động lưu lại lịch sử kèm theo trạng thái (hoàn thành, từ chối hoặc cuộc gọi nhỡ) ngay trong nội dung trò chuyện.

1. ### ***Cuộc gọi 1-1***

**Đặc tả UC-GD01 – Cuộc gọi 1-1**

| Trường	 | Nội dung |
| :---- | :---- |
| Tên use case	 | Thực hiện cuộc gọi 1-1 |
| Tác nhân chính | Người gọi |
| Tác nhân phụ | Người nhận |
| Mô tả | Người dùng thực hiện cuộc gọi thoại/video 1-1 |
| Điều kiện tiên quyết	 | Đang trong cuộc trò chuyện 1-1; hai bên không chặn nhau |
| Điều kiện sau | Lịch sử cuộc gọi xuất hiện trong cuộc trò chuyện của cả hai bên |

**Luồng sự kiện chính — Cuộc gọi được chấp nhận:**

1. Người gọi yêu cầu khởi tạo cuộc gọi (thoại hoặc video) đến một người dùng cụ thể.  
2. Hệ thống xác thực các điều kiện kết nối và gửi tín hiệu yêu cầu cuộc gọi đến người nhận.  
3. Người nhận xác nhận tham gia cuộc gọi.  
4. Hệ thống thiết lập kênh kết nối dữ liệu giữa hai bên.  
5. Một trong hai bên yêu cầu ngắt kết nối hoặc tín hiệu bị gián đoạn.  
6. Hệ thống thực hiện ghi nhận lịch sử vào dữ liệu cuộc trò chuyện của cả hai bên.

**Luồng thay thế:**

* **\[A1\]** Bước 3 — Người nhận Từ chối: hệ thống thông báo đến người gọi; ghi lịch sử cuộc gọi nhỡ cho cả hai.  
* **\[A2\]** Bước 3 — Người nhận không trả lời: hệ thống thông báo không có phản hồi; ghi lịch sử cuộc gọi nhỡ cho cả hai.

![][image53]

*Sơ đồ hoạt động \- Cuộc gọi 1-1*

![][image54]

*Sơ đồ tuần tự \- Cuộc gọi 1-1*

2. ### ***Cuộc gọi nhóm***

**Đặc tả UC-GD02 – Cuộc gọi nhóm**

| Trường	 | Nội dung |
| :---- | :---- |
| Tên use case	 | Thực hiện cuộc gọi nhóm |
| Tác nhân chính | Người khởi tạo cuộc gọi |
| Tác nhân phụ | Các thành viên nhóm |
| Mô tả | Người dùng thực hiện cuộc gọi thoại/video nhóm |
| Điều kiện tiên quyết	 | Đang trong cuộc trò chuyện nhóm |
| Điều kiện sau | Lịch sử cuộc gọi xuất hiện trong cuộc trò chuyện nhóm |

**Luồng sự kiện chính:**

1. Người dùng yêu cầu khởi tạo cuộc gọi nhóm (thoại hoặc video).  
2. Hệ thống gửi tín hiệu mời tham gia cuộc gọi đến toàn bộ thành viên trong nhóm.  
3. Các thành viên thực hiện xác nhận tham gia hoặc từ chối yêu cầu.  
4. Hệ thống thiết lập kênh kết nối đa phương điểm cho các thành viên tham gia.  
5. Khi thành viên yêu cầu ngắt kết nối hoặc toàn bộ thành viên rời khỏi kênh, hệ thống thực hiện ghi nhận lịch sử cuộc gọi vào dữ liệu nhóm.

![][image55]

*Sơ đồ hoạt động \- Cuộc gọi nhóm*

![][image56]

*Sơ đồ tuần tự \- Cuộc gọi nhóm*

---

13. # **Quy trình Thông báo**

Hệ thống tự động gửi thông báo khi có các tương tác liên quan đến người dùng như: nhận cảm xúc, bình luận, lời mời kết bạn hoặc các cập nhật về trạng thái báo cáo vi phạm. Thông báo được hiển thị trực tiếp trong ứng dụng và gửi qua tin nhắn đẩy (push notification) nếu người dùng đã bật tính năng này trên thiết bị. Quản trị viên cũng nhận được thông báo ngay khi có báo cáo vi phạm mới cần xử lý.

1. ### ***Nhận và xem thông báo***

**Đặc tả UC-TB01 – Nhận và xem thông báo**

| Trường	 | Nội dung |
| :---- | :---- |
| Tên use case	 | Nhận và xem thông báo |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả | Người dùng nhận và xem khi có thông báo mới |
| Điều kiện tiên quyết	 | Có sự kiện tương tác liên quan đến người dùng |
| Điều kiện sau | Thông báo xuất hiện trong danh sách |

**Luồng sự kiện chính:**

1. Hệ thống ghi nhận sự kiện tương tác phát sinh (cảm xúc, bình luận, kết bạn, báo cáo...).  
2. Hệ thống tự động tạo dữ liệu thông báo tương ứng cho các đối tượng liên quan.  
3. Dữ liệu được truyền tải đến thiết bị người dùng thông qua các kênh hiển thị mặc định và tin nhắn đẩy (nếu được cấp quyền).  
4. Người dùng yêu cầu truy cập thông tin chi tiết từ thông báo.  
5. Hệ thống điều hướng người dùng đến nội dung nghiệp vụ liên quan.

**![][image57]**

*Sơ đồ hoạt động \- Quy trình nhận và xem thông báo*

**![][image58]**

*Sơ đồ tuần tự \- Luồng nhận và xem thông báo*

2. ### ***Quản lý thông báo***

**Đặc tả UC-TB02 – Quản lý thông báo**

| Trường	 | Nội dung |
| :---- | :---- |
| Tên use case	 | Quản lý thông báo |
| Tác nhân | Người dùng đã đăng nhập |
| Mô tả	 | Người dùng đánh dấu đã đọc hoặc xóa thông báo |
| Điều kiện tiên quyết	 | Người dùng có ít nhất một thông báo |
| Điều kiện sau | Trạng thái thông báo được cập nhật hoặc thông báo bị xóa |

**Luồng sự kiện chính:**

1. Người dùng mở danh sách thông báo.  
2. Người dùng chọn thao tác:

| Thao tác	 | Kết quả |
| :---- | :---- |
| Nhấn vào 1 thông báo	 | Đánh dấu đã đọc; chuyển đến nội dung liên quan |
| Đánh dấu tất cả đã đọc	 | Toàn bộ chuyển sang đã đọc; badge về 0 |
| Xóa 1 thông báo	 | Thông báo bị xóa khỏi danh sách |
| Xóa tất cả	 | Toàn bộ danh sách bị xóa |

**Luồng thay thế:**

* **\[A1\]** Danh sách rỗng: hệ thống hiển thị không có thông báo mới.

![][image59]

![][image60]

---

14. # **Quy trình Quản lý Chặn**

Tính năng cho phép người dùng chủ động tùy chỉnh các giới hạn tương tác (***chặn tin nhắn, chặn cuộc gọi, chặn và ẩn khỏi nhật ký (chặn đối phương xem hoạt động của mình / ẩn hoạt động của đối phương)***) đối với một tài khoản cụ thể. Hệ thống sẽ ghi nhận các thiết lập này để áp dụng rào cản tương ứng, hoặc tự động khôi phục toàn bộ quyền tương tác nếu người dùng hủy bỏ mọi giới hạn.

| Thành phần | Nội dung chi tiết |
| :---- | :---- |
| Tên Use Case  | UC\_Manage\_Block |
| Tác nhân  | Người dùng đã đăng nhập |
| Mô tả tóm tắt | Cho phép người dùng thiết lập và quản lý các tham số chặn linh hoạt (***tin nhắn, cuộc gọi, chặn và ẩn khỏi nhật ký***) đối với một tài khoản đích. Hệ thống sẽ lưu trữ cấu hình riêng biệt và thực thi việc hạn chế tương tác hai chiều tương ứng. |
| Tiền điều kiện  | Người dùng đã đăng nhập. Tài khoản đích cần quản lý giới hạn tương tác vẫn đang tồn tại trên hệ thống. |
| Hậu điều kiện  | Các thiết lập giới hạn tương tác mới được hệ thống lưu trữ thành công. Hệ thống dựa vào trạng thái này để cho phép hoặc từ chối các quyền tương tác giữa hai tài khoản. |

**Luồng sự kiện chính:**

1. Người dùng gửi yêu cầu quản lý chặn đối với một tài khoản đích.  
2. Hệ thống kiểm tra và phản hồi trạng thái giới hạn tương tác hiện tại của tài khoản đó.  
3. Người dùng thay đổi các tùy chọn (tích chọn) và xác nhận áp dụng.  
4. Hệ thống tiếp nhận yêu cầu và xử lý dựa trên các tùy chọn mới:  
* **Trường hợp 1 (Cập nhật/thiết lập một phần):** Nếu có ít nhất một tùy chọn chặn được bật, hệ thống ghi nhận và lưu lại thiết lập mới.  
* **Trường hợp 2 (gỡ chặn hoàn toàn):** Nếu tất cả các tùy chọn chặn đều bị tắt, hệ thống tự động xóa bỏ thiết lập chặn cũ (khôi phục trạng thái bình thường).  
5. Hệ thống lập tức áp dụng các quy tắc tương tác dựa trên trạng thái vừa cập nhật và hiển thị thông báo thành công. Kết thúc luồng.

**Luồng thay thế:**

**\[A1\]:** Tại bước 3, nếu người dùng đóng cửa sổ tùy chọn hoặc từ chối xác nhận, hệ thống hủy bỏ tiến trình, không ghi nhận bất kỳ thay đổi nào và bảo toàn trạng thái tương tác hiện tại.

![][image61]

![][image62]

gfjf

---

15. # **Quy trình quản lý người dùng**

Chức năng này cung cấp cho Quản trị viên công cụ để kiểm soát toàn bộ tài khoản trên hệ thống. Quản trị viên có thể tra cứu danh sách, xem thống kê trạng thái (Hoạt động/Bị khóa). Khi Quản trị viên thực thi lệnh Khóa (Ban) một tài khoản, hệ thống sẽ tự động thu hồi mọi phiên đăng nhập của người dùng đó, đồng thời gửi một email thông báo lý do kèm theo đường link truy cập vào biểu mẫu khiếu nại. Ngược lại, Quản trị viên cũng có thể dùng chức năng này để Mở khóa (Unban), khôi phục quyền truy cập cho người dùng

16. # **Quy trình Gửi và Xử lý báo cáo**

    1. ## ***Gửi báo cáo***

Chức năng này cho phép người dùng chủ động báo cáo các hành vi vi phạm tiêu chuẩn cộng đồng. Người dùng có thể chọn đối tượng muốn báo cáo (tài khoản người dùng, bài viết, hoặc bình luận). Khi gửi báo cáo, người dùng cần nhập lý do chi tiết, có thể đính kèm hình ảnh/video để minh chứng và tùy chọn chặn luôn tài khoản người dùng. Để tránh tình trạng spam hệ thống, mỗi người dùng chỉ được phép gửi báo cáo tối đa một lần cho cùng một đối tượng vi phạm.

| Thành phần | Nội dung chi tiết |
| :---- | :---- |
| Tên Use Case  | UC\_Report |
| Tác nhân  | Người dùng đã đăng nhập  |
| Mô tả tóm tắt | Cho phép người dùng báo cáo các đối tượng vi phạm (bài viết, bình luận, tài khoản) kèm theo lý do cụ thể (spam, quấy rối, ngôn từ thù ghét, nhạy cảm, lừa đảo...).  |
| Tiền điều kiện  | Người dùng đã đăng nhập vào hệ thống. Đối tượng bị báo cáo(các bài viết, bình luận,...) vẫn còn tồn tại trên thống. Người dùng chưa từng gửi báo cáo cho chính đối tượng này trước đó. |
| Hậu điều kiện  | Kích hoạt gửi thông báo (Notification) tự động đến Quản trị viên (Admin) về việc có báo cáo mới cần xử lý. |

Luồng sự kiện chính:

1. Người dùng gửi yêu cầu báo cáo vi phạm đối với một đối tượng cụ thể (Bài viết, Bình luận, hoặc Tài khoản).  
2. Hệ thống kiểm tra lịch sử báo cáo. Nếu hợp lệ (chưa từng báo cáo), hệ thống cho phép tiếp tục quy trình.  
3. Người dùng gửi dữ liệu báo cáo bao gồm: lý do vi phạm, mô tả chi tiết (tùy chọn) và yêu cầu chặn tài khoản (tùy chọn).  
4. Hệ thống ghi nhận dữ liệu, tạo mới bản ghi báo cáo với trạng thái "Chờ xử lý" .  
5. Hệ thống kích hoạt gửi thông báo (Notification) đến Quản trị viên và trả về kết quả gửi thành công cho người dùng. Kết thúc luồng.

Luồng thay thế:

* **\[A1** Bước 2, nếu phát hiện người dùng đã từng báo cáo đối tượng này, hệ thống từ chối yêu cầu và trả về lỗi "Nội dung này đã báo cáo trước đó".  
* **\[A2\]** Bước 3, nếu người dùng từ chối gửi dữ liệu (hủy thao tác), hệ thống hủy bỏ tiến trình khởi tạo, không ghi nhận bất kỳ dữ liệu nào và kết thúc Use Case.  
* **\[A3\]** Bước 4, nếu hệ thống phát hiện đối tượng đã bị chủ sở hữu xóa trong quá trình người dùng đang khởi tạo báo cáo, hệ thống từ chối lưu bản ghi và trả về thông báo lỗi "Đối tượng không còn tồn tại".

![][image63]

![][image64]

## ***Xử lý báo cáo (Quản trị viên)***

Chức năng này giúp quản trị viên tiếp nhận và giải quyết các đơn báo cáo từ người dùng. Quản trị viên sẽ xem xét đối tượng bị báo cáo và hình ảnh minh chứng để đưa ra hướng xử lý phù hợp. Tùy theo mức độ vi phạm mà quản trị viên sẽ đưa ra sự lựa chọn: xóa nội dung, cảnh báo, khóa tài khoản hoặc từ chối xử lý. Mọi thao tác khi thực thi thành công hệ thống sẽ tự động chuyển các đơn báo cáo “Đã xử lý ” , “Từ chối” và gửi thống báo cho đến đối tượng bị báo cáo

| Thành phần | Nội dung chi tiết |
| :---- | :---- |
| Tên Use Case  | UC\_Check\_Report |
| Tác nhân  | Quản trị viên(Admin) |
| Mô tả tóm tắt | Quản trị viên tiếp nhận, xem xét và đưa ra quyết định xử lý đối với các báo cáo vi phạm (Xóa nội dung, Cảnh báo, Khóa tài khoản hoặc Từ chối). Hệ thống sẽ thực thi quyết định, cập nhật trạng thái báo cáo và tự động gửi thông báo kết quả đến các bên liên quan (người báo cáo và người bị báo cáo). |
| Tiền điều kiện  | Quản trị viên đã đăng nhập vào phân hệ quản trị với quyền hợp lệ. Có ít nhất một báo cáo đang ở trạng thái 'Chờ xử lý' trong cơ sở dữ liệu. |
| Hậu điều kiện  | Trạng thái của báo cáo được cập nhật thành 'Đã xử lý' hoặc 'Đã từ chối'. Các thông báo tự động (kết quả xử lý, cảnh báo vi phạm) được phân phát thành công đến người báo cáo và người bị báo cáo tương ứng." |

Luồng sự kiện chính:

1. Quản trị viên yêu cầu truy xuất danh sách báo cáo vi phạm.  
2. Hệ thống truy vấn CSDL và trả về danh sách các báo cáo đang ở trạng thái "Chờ xử lý".	  
3. Quản trị viên gửi yêu cầu xem chi tiết một báo cáo cụ thể.  
4. Hệ thống kiểm tra tính tồn tại của đối tượng bị báo cáo. Nếu hợp lệ, hệ thống trả về dữ liệu chi tiết (người gửi, lý do, nội dung vi phạm).  
5. Quản trị viên gửi quyết định xử lý (Xóa nội dung / Cảnh báo / Khóa tài khoản / Từ chối).  
6. Hệ thống thực thi quyết định, cập nhật trạng thái báo cáo ("Đã xử lý" hoặc "Đã từ chối"), và tự động phân phát thông báo đến các bên liên quan. Kết thúc Use Case.

Luồng thay thế:

**\[A1\]:** Tại bước 5, khi yêu cầu xác nhận hành động phạt (Xóa/Khóa/Cảnh báo), nếu Quản trị viên từ chối xác nhận (hủy thao tác), hệ thống hủy bỏ tiến trình thực thi, không cập nhật bất kỳ dữ liệu nào và giữ nguyên báo cáo ở trạng thái "Chờ xử lý".

**\[A2\]:** Tại bước 4, hệ thống truy xuất chi tiết báo cáo, nếu phát hiện đối tượng vi phạm (bài viết/bình luận) đã bị xóa khỏi cơ sở dữ liệu từ trước, hệ thống hiển thị thông báo nội dung đã bị xóa. Quản trị viên thực hiện xác nhận sau đó hệ thống cập nhật trạng thái xử lý báo cáo và kết thúc.

![][image65]

![][image66]

---

17. # **Quy trình khiếu nại(Ý kiến cá nhân chưa thống nhất)**

## ***17.1 Gửi khiếu nại***

Chức năng này cung cấp cơ chế giải trình cho các tài khoản đang trong trạng thái bị khóa. Thông qua đường link được cấp trong email thông báo khóa tài khoản, người dùng truy cập vào dẫn tới biểu mẫu. Tại đây, người dùng điền lý do khiếu nại và tải lên các hình ảnh bằng chứng để chứng minh mình không vi phạm. Hệ thống sẽ ghi nhận và tạo một phiếu khiếu nại (Ticket) ở trạng thái "Chờ xử lý". Mỗi tài khoản chỉ được phép tồn tại một phiếu khiếu nại đang chờ xử lý tại một thời điểm.

| Thành phần | Nội dung chi tiết |
| :---- | :---- |
| Tên Use Case  |  |
| Tác nhân  |  |
| Mô tả tóm tắt |  |
| Tiền điều kiện  |  |
| Hậu điều kiện  |  |

## ***17.2 Xử lý khiếu nại***

Chức năng này cho phép Quản trị viên quản lý và phân xử các phiếu khiếu nại do người dùng gửi lên. Quản trị viên truy cập vào danh sách khiếu nại đang chờ, đối chiếu lý do và minh chứng của người dùng với lịch sử vi phạm. Sau khi xem xét, Quản trị viên đưa ra một trong hai quyết định:

* **Từ chối:** Giữ nguyên trạng thái khóa của tài khoản và hệ thống từ chối xử lý khiếu nại.  
* **Chấp thuận:** Hệ thống tự động chuyển trạng thái tài khoản thành "Hoạt động" (Unban), khôi phục quyền đăng nhập cho người dùng và đóng phiếu. Kết quả xử lý sẽ được hệ thống gửi thông báo qua email cho người dùng