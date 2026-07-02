const http = require('http');

http.get('http://localhost:5000/api/marketplace/products', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Status Code:", res.statusCode);
    console.log("Response headers:", res.headers);
    console.log("Response length:", data.length);
    try {
      const parsed = JSON.parse(data);
      console.log("Body success:", parsed.success);
      const prods = parsed.data?.products || parsed.products;
      console.log("Products count:", prods ? prods.length : 'none');
      console.log("Products total field:", parsed.data?.total ?? parsed.total);
      if (prods) {
        console.log("Products:", JSON.stringify(prods.map(p => ({ id: p.id, name: p.name, seller: p.seller?.name, org: p.organization?.organizationName })), null, 2));
      } else {
        console.log("Data sample:", data.slice(0, 500));
      }
    } catch (e) {
      console.log("Error parsing JSON:", e.message);
      console.log("Raw Data:", data.slice(0, 1000));
    }
  });
}).on('error', console.error);
