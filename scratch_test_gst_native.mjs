// Use native fetch (available in Node 18+)
const apiKey = "6ed3dc5cee6c13d9fb220ea78120ed2a2cd7205f542c117902d5f71bf74037a9";
const clientId = "in.pugarch";
const testGstin = "27AAOCP3437H1Z4";
const apiUrl = `https://apisetu.gov.in/gstn/v2/taxpayers/${testGstin}`;

console.log(`Testing live API endpoint with native fetch: ${apiUrl}`);

// Bypass SSL verification by temporarily relaxing global settings for this run 
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function test() {
  try {
    const resp = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-APISETU-APIKEY': apiKey,
        'X-APISETU-CLIENTID': clientId,
        'Accept': 'application/json'
      }
    });
    
    const text = await resp.text();
    console.log(`HTTP Status Code Received: ${resp.status}`);
    console.log(`Response Snippet: ${text.substring(0, 500)}`);
    if(resp.status === 200) {
        console.log("--- SUCCESS: API CREDENTIALS ARE VALID! ---");
    } else {
        console.log("--- FAILED: Endpoints/credentials issue ---");
    }
  } catch (err) {
    console.error("Critical error occurred:", err.message);
  }
}

test();
