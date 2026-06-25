import './src/config/env.js';
import app from './index.js';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const JWT_SECRET = "MSME_PugArch_JWT_SECRET_SUPER_SECURE_KEY_2026";

async function main() {
  const buyerToken = jwt.sign({ id: 10, email: "factsf132@gmail.com", role: "buyer", sessionVersion: 5 }, JWT_SECRET, { expiresIn: '1h' });
  const sellerToken = jwt.sign({ id: 6, email: "anandgadge1008@gmail.com", role: "seller", sessionVersion: 4 }, JWT_SECRET, { expiresIn: '1h' });

  const port = 5009;
  const server = app.listen(port, async () => {
    console.log(`Test server running on port ${port}`);
    try {
      // 1. Test as Buyer
      const url = `http://localhost:${port}/api/bids/TND-2026-ANAND001`;
      console.log(`\nFetching as Buyer: ${url}`);
      const resBuyer = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${buyerToken}`
        }
      });
      console.log(`Buyer Response Status: ${resBuyer.status}`);
      console.log(`Buyer Response Body:`, await resBuyer.text());

      // 2. Test as Seller
      console.log(`\nFetching as Seller: ${url}`);
      const resSeller = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sellerToken}`
        }
      });
      console.log(`Seller Response Status: ${resSeller.status}`);
      console.log(`Seller Response Body:`, await resSeller.text());

    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      server.close(() => {
        console.log('Test server closed');
        process.exit(0);
      });
    }
  });
}

main().catch(console.error);
