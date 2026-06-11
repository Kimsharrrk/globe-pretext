import fs from 'fs';

async function main() {
  const res = await fetch('https://raw.githubusercontent.com/eesur/country-codes-lat-long/master/country-codes-lat-long-alpha3.json');
  const data = await res.json();
  const validData = data.ref_country_codes.filter((d: any) => d.latitude && d.longitude).map((d: any) => ({
    country: d.country,
    lat: d.latitude,
    lon: d.longitude
  }));
  fs.writeFileSync('public/countries.json', JSON.stringify(validData));
  console.log('Saved to public/countries.json', validData.length);
}
main();
