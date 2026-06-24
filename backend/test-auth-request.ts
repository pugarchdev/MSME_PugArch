import jwt from 'jsonwebtoken';
import http from 'http';

const JWT_SECRET = "MSME_PugArch_JWT_SECRET_SUPER_SECURE_KEY_2026";
const payload = {
  id: 6,
  email: "anandgadge1008@gmail.com",
  role: "seller",
  sessionVersion: 3
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/marketplace/products',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log("STATUS CODE:", res.statusCode);
    console.log("RESPONSE:", data);
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.end();
