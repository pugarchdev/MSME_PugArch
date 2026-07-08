import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_ACCESS_SECRET or JWT_SECRET is required');
}

async function main() {
  const payload = {
    id: 6,
    email: "kolhesnehal065@gmail.com",
    role: "buyer",
    sessionVersion: 0
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  console.log('Signed token:', token);

  const resDirect = await fetch('http://localhost:5000/api/direct-purchases', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Direct Purchases API status:', resDirect.status);
  const dataDirect = await resDirect.json();
  console.log('Direct Purchases API response:', JSON.stringify(dataDirect, null, 2));

  const resQuotes = await fetch('http://localhost:5000/api/quote-requests', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Quote Requests API status:', resQuotes.status);
  const dataQuotes = await resQuotes.json();
  console.log('Quote Requests API response:', JSON.stringify(dataQuotes, null, 2));
}

main().catch(console.error);
