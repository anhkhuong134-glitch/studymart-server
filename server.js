const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// Chìa khóa bảo mật để tạo Token (Sếp có thể đổi thành chữ gì tùy thích)
const JWT_SECRET = 'studymart_secret_key_2026';

// ==========================================
// KẾT NỐI DATABASE (Sếp nhớ kiểm tra lại tên DB nhé)
// ==========================================
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "", // Mật khẩu xampp mặc định là rỗng
    database: "studymart" // <--- SẾP SỬA LẠI TÊN DATABASE Ở ĐÂY CHO ĐÚNG NHÉ
});

db.connect((err) => {
    if (err) {
        console.log("Lỗi kết nối Database:", err);
    } else {
        console.log("Đã kết nối Database thành công! 🎉");
    }
});

// ==========================================
// 1. API ĐĂNG KÝ / ĐĂNG NHẬP (AUTH)
// ==========================================

// ĐĂNG KÝ TÀI KHOẢN
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Băm mật khẩu ra mã loằng ngoằng trước khi lưu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Mặc định tạo tài khoản mới sẽ là 'user'
        const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')";
        db.query(sql, [username, hashedPassword], (err, result) => {
            if (err) return res.status(500).json({ message: "Lỗi tạo tài khoản (Có thể trùng tên)" });
            return res.json({ message: "Đăng ký thành công!" });
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server" });
    }
});

// ĐĂNG NHẬP (Giữ nguyên code chuẩn của sếp)
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log("=== CÓ NGƯỜI ĐĂNG NHẬP ===");
    console.log("Dữ liệu nhận được:", req.body);

    const sql = 'SELECT * FROM users WHERE username = ?';
    db.query(sql, [username], async (err, results) => {
        if (err) return res.status(500).json({ message: "Lỗi server" });
        
        if (results.length === 0) {
            return res.status(400).json({ message: "Sai username hoặc password!" });
        }

        const user = results[0];

        // So sánh mật khẩu khách nhập với mật khẩu băm trong DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Sai username hoặc password!" });
        }

        // Tạo Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '1d' } // Sống trong 1 ngày
        );

        res.json({ 
            message: "Đăng nhập thành công!", 
            token, 
            user: { id: user.id, username: user.username, role: user.role } 
        });
    });
});

// ==========================================
// 2. API QUẢN LÝ NGƯỜI DÙNG (USERS)
// ==========================================

// Lấy danh sách user (Không lấy password)
app.get('/users', (req, res) => {
    const sql = "SELECT id, username, role FROM users"; 
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// Xóa user 
app.delete('/users/:id', (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM users WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Đã xóa người dùng thành công" });
    });
});

// ==========================================
// 3. API QUẢN LÝ SẢN PHẨM (PRODUCTS)
// ==========================================

// Lấy danh sách tất cả sản phẩm 
app.get('/products', (req, res) => {
    const sql = "SELECT * FROM products";
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        return res.json(data);
    });
});

// Thêm sản phẩm mới
app.post('/products', (req, res) => {
    const { name, price, description, image_url, category_id, stock } = req.body;
    const sql = "INSERT INTO products (name, price, description, image_url, category_id, stock) VALUES (?, ?, ?, ?, ?, ?)";
    
    db.query(sql, [name, price, description, image_url, category_id, stock], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Thêm sản phẩm thành công!", id: result.insertId });
    });
});

// Cập nhật (Sửa) thông tin sản phẩm
app.put('/products/:id', (req, res) => {
    const id = req.params.id;
    const { name, price, description, image_url, category_id, stock } = req.body;
    const sql = "UPDATE products SET name=?, price=?, description=?, image_url=?, category_id=?, stock=? WHERE id=?";
    
    db.query(sql, [name, price, description, image_url, category_id, stock, id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Cập nhật sản phẩm thành công!" });
    });
});

// Xóa sản phẩm
app.delete('/products/:id', (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM products WHERE id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ message: "Đã xóa sản phẩm khỏi hệ thống!" });
    });
});

// ==========================================
// 4. API TÍNH NĂNG ĐẶC BIỆT: FLASH SALE
// ==========================================

// Cập nhật giá (giảm giá) hàng loạt theo danh mục
app.put('/api/products/flash-sale', (req, res) => {
    const { categoryId, discountPercent } = req.body;
    let sql = "";
    let params = [];

    if (categoryId === 'all') {
        sql = "UPDATE products SET price = price - (price * ? / 100)";
        params = [discountPercent];
    } else {
        sql = "UPDATE products SET price = price - (price * ? / 100) WHERE category_id = ?";
        params = [discountPercent, categoryId];
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        return res.json({ 
            message: `Đã kích hoạt Flash Sale giảm ${discountPercent}% thành công!`,
            affectedRows: result.affectedRows 
        });
    });
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================
app.listen(5000, () => {
    console.log("🚀 Server đang chạy ngon lành tại port 5000...");
});