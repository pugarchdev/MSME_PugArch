import fetch from 'node-fetch';
import https from 'https';

const apiKey = "6ed3dc5cee6c13d9fb220ea78120ed2a2cd7205f542c117902d5f71bf74037a9";
const clientId = "in.pugarch";
const testGstin = "27AAOCP3437H1Z4";
const apiUrl = `https://apisetu.gov.in/gstn/v2/taxpayers/${testGstin}`;

console.log(`Attempting to test URL: ${apiUrl}`);

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function test() {
  try {
    const resp = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-APISETU-APIKEY': apiKey,
        'X-APISETU-CLIENTID': clientId,
        'Accept': 'application/json'
      },
      agent: agent
    });
    
    const text = await resp.text();
    console.log(`Status: ${resp.status}`);
    console.log(`Response Text: ${text.substring(0, 300)}`);
  } catch (err) {
    console.error("Connection error:", err);
  }
}

test();
