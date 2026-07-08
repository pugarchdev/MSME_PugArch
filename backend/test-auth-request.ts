import jwt from 'jsonwebtoken';
import http from 'http';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_ACCESS_SECRET or JWT_SECRET is required');
}
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
