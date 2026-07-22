// First-level administrative subdivision presets for the countries surfaced in
// the geography catalog. Full-length note bodies are generated with Gemini Pro
// by scripts/generateSubdivisionNotes.js and merged in from
// subdivisionNotesGenerated.js; any subdivision without generated content falls
// back to the compact starter template below.
import { GENERATED_SUBDIVISION_NOTES } from './subdivisionNotesGenerated.js';

const rows = (text, defaultType) => text.trim().split('\n').map(line => {
  const [name, capital, type = defaultType] = line.split('|');
  return { name, capital, type };
});

const slugify = value => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const subdivisionGroups = [
  {
    country: 'India',
    region: 'Asia',
    rows: rows(`
Andhra Pradesh|Amaravati|State
Arunachal Pradesh|Itanagar|State
Assam|Dispur|State
Bihar|Patna|State
Chhattisgarh|Raipur|State
Goa|Panaji|State
Gujarat|Gandhinagar|State
Haryana|Chandigarh|State
Himachal Pradesh|Shimla|State
Jharkhand|Ranchi|State
Karnataka|Bengaluru|State
Kerala|Thiruvananthapuram|State
Madhya Pradesh|Bhopal|State
Maharashtra|Mumbai|State
Manipur|Imphal|State
Meghalaya|Shillong|State
Mizoram|Aizawl|State
Nagaland|Kohima|State
Odisha|Bhubaneswar|State
Punjab|Chandigarh|State
Rajasthan|Jaipur|State
Sikkim|Gangtok|State
Tamil Nadu|Chennai|State
Telangana|Hyderabad|State
Tripura|Agartala|State
Uttar Pradesh|Lucknow|State
Uttarakhand|Dehradun|State
West Bengal|Kolkata|State
Andaman and Nicobar Islands|Sri Vijaya Puram (Port Blair)|Union territory
Chandigarh|Chandigarh|Union territory
Dadra and Nagar Haveli and Daman and Diu|Daman|Union territory
Delhi|New Delhi|Union territory
Jammu and Kashmir|Srinagar (summer), Jammu (winter)|Union territory
Ladakh|Leh|Union territory
Lakshadweep|Kavaratti|Union territory
Puducherry|Puducherry|Union territory
`),
  },
  {
    country: 'United States',
    region: 'Americas',
    rows: rows(`
Alabama|Montgomery|State
Alaska|Juneau|State
Arizona|Phoenix|State
Arkansas|Little Rock|State
California|Sacramento|State
Colorado|Denver|State
Connecticut|Hartford|State
Delaware|Dover|State
Florida|Tallahassee|State
Georgia|Atlanta|State
Hawaii|Honolulu|State
Idaho|Boise|State
Illinois|Springfield|State
Indiana|Indianapolis|State
Iowa|Des Moines|State
Kansas|Topeka|State
Kentucky|Frankfort|State
Louisiana|Baton Rouge|State
Maine|Augusta|State
Maryland|Annapolis|State
Massachusetts|Boston|State
Michigan|Lansing|State
Minnesota|Saint Paul|State
Mississippi|Jackson|State
Missouri|Jefferson City|State
Montana|Helena|State
Nebraska|Lincoln|State
Nevada|Carson City|State
New Hampshire|Concord|State
New Jersey|Trenton|State
New Mexico|Santa Fe|State
New York|Albany|State
North Carolina|Raleigh|State
North Dakota|Bismarck|State
Ohio|Columbus|State
Oklahoma|Oklahoma City|State
Oregon|Salem|State
Pennsylvania|Harrisburg|State
Rhode Island|Providence|State
South Carolina|Columbia|State
South Dakota|Pierre|State
Tennessee|Nashville|State
Texas|Austin|State
Utah|Salt Lake City|State
Vermont|Montpelier|State
Virginia|Richmond|State
Washington|Olympia|State
West Virginia|Charleston|State
Wisconsin|Madison|State
Wyoming|Cheyenne|State
District of Columbia|Washington|Federal district
`),
  },
  {
    country: 'China',
    region: 'Asia',
    rows: rows(`
Anhui|Hefei|Province
Fujian|Fuzhou|Province
Gansu|Lanzhou|Province
Guangdong|Guangzhou|Province
Guizhou|Guiyang|Province
Hainan|Haikou|Province
Hebei|Shijiazhuang|Province
Heilongjiang|Harbin|Province
Henan|Zhengzhou|Province
Hubei|Wuhan|Province
Hunan|Changsha|Province
Jiangsu|Nanjing|Province
Jiangxi|Nanchang|Province
Jilin|Changchun|Province
Liaoning|Shenyang|Province
Qinghai|Xining|Province
Shaanxi|Xi'an|Province
Shandong|Jinan|Province
Shanxi|Taiyuan|Province
Sichuan|Chengdu|Province
Taiwan|Taipei|Province
Yunnan|Kunming|Province
Zhejiang|Hangzhou|Province
Guangxi|Nanning|Autonomous region
Inner Mongolia|Hohhot|Autonomous region
Ningxia|Yinchuan|Autonomous region
Xinjiang|Urumqi|Autonomous region
Xizang (Tibet)|Lhasa|Autonomous region
Beijing|Beijing|Municipality
Chongqing|Chongqing|Municipality
Shanghai|Shanghai|Municipality
Tianjin|Tianjin|Municipality
Hong Kong|Hong Kong|Special administrative region
Macao|Macao|Special administrative region
`),
  },
  {
    country: 'Brazil',
    region: 'Americas',
    rows: rows(`
Acre|Rio Branco|State
Alagoas|Maceio|State
Amapá|Macapá|State
Amazonas|Manaus|State
Bahia|Salvador|State
Ceará|Fortaleza|State
Espírito Santo|Vitória|State
Goiás|Goiânia|State
Maranhão|São Luís|State
Mato Grosso|Cuiabá|State
Mato Grosso do Sul|Campo Grande|State
Minas Gerais|Belo Horizonte|State
Pará|Belém|State
Paraíba|João Pessoa|State
Paraná|Curitiba|State
Pernambuco|Recife|State
Piauí|Teresina|State
Rio de Janeiro|Rio de Janeiro|State
Rio Grande do Norte|Natal|State
Rio Grande do Sul|Porto Alegre|State
Rondônia|Porto Velho|State
Roraima|Boa Vista|State
Santa Catarina|Florianópolis|State
São Paulo|São Paulo|State
Sergipe|Aracaju|State
Tocantins|Palmas|State
Federal District|Brasília|Federal district
`),
  },
  {
    country: 'Argentina',
    region: 'Americas',
    rows: rows(`
Buenos Aires|La Plata|Province
Catamarca|San Fernando del Valle de Catamarca|Province
Chaco|Resistencia|Province
Chubut|Rawson|Province
City of Buenos Aires|Buenos Aires|Autonomous city
Córdoba|Córdoba|Province
Corrientes|Corrientes|Province
Entre Ríos|Paraná|Province
Formosa|Formosa|Province
Jujuy|San Salvador de Jujuy|Province
La Pampa|Santa Rosa|Province
La Rioja|La Rioja|Province
Mendoza|Mendoza|Province
Misiones|Posadas|Province
Neuquén|Neuquén|Province
Río Negro|Viedma|Province
Salta|Salta|Province
San Juan|San Juan|Province
San Luis|San Luis|Province
Santa Cruz|Río Gallegos|Province
Santa Fe|Santa Fe|Province
Santiago del Estero|Santiago del Estero|Province
Tierra del Fuego, Antarctica and South Atlantic Islands|Ushuaia|Province
Tucumán|San Miguel de Tucumán|Province
`),
  },
  {
    country: 'Australia',
    region: 'Oceania',
    rows: rows(`
New South Wales|Sydney|State
Queensland|Brisbane|State
South Australia|Adelaide|State
Tasmania|Hobart|State
Victoria|Melbourne|State
Western Australia|Perth|State
Australian Capital Territory|Canberra|Territory
Northern Territory|Darwin|Territory
`),
  },
  {
    country: 'Mexico',
    region: 'Americas',
    rows: rows(`
Aguascalientes|Aguascalientes|State
Baja California|Mexicali|State
Baja California Sur|La Paz|State
Campeche|San Francisco de Campeche|State
Chiapas|Tuxtla Gutiérrez|State
Chihuahua|Chihuahua|State
Mexico City|Mexico City|Federal entity
Coahuila|Saltillo|State
Colima|Colima|State
Durango|Victoria de Durango|State
Guanajuato|Guanajuato|State
Guerrero|Chilpancingo|State
Hidalgo|Pachuca|State
Jalisco|Guadalajara|State
México|Toluca|State
Michoacán|Morelia|State
Morelos|Cuernavaca|State
Nayarit|Tepic|State
Nuevo León|Monterrey|State
Oaxaca|Oaxaca de Juárez|State
Puebla|Puebla|State
Querétaro|Santiago de Querétaro|State
Quintana Roo|Chetumal|State
San Luis Potosí|San Luis Potosí|State
Sinaloa|Culiacán|State
Sonora|Hermosillo|State
Tabasco|Villahermosa|State
Tamaulipas|Ciudad Victoria|State
Tlaxcala|Tlaxcala|State
Veracruz|Xalapa|State
Yucatán|Mérida|State
Zacatecas|Zacatecas|State
`),
  },
  {
    country: 'Russia',
    region: 'Europe & Asia',
    rows: rows(`
Adygea|Maykop|Republic
Altai|Gorno-Altaysk|Republic
Bashkortostan|Ufa|Republic
Buryatia|Ulan-Ude|Republic
Chechnya|Grozny|Republic
Chuvashia|Cheboksary|Republic
Dagestan|Makhachkala|Republic
Ingushetia|Magas|Republic
Kabardino-Balkaria|Nalchik|Republic
Kalmykia|Elista|Republic
Karachay-Cherkessia|Cherkessk|Republic
Karelia|Petrozavodsk|Republic
Khakassia|Abakan|Republic
Komi|Syktyvkar|Republic
Mari El|Yoshkar-Ola|Republic
Mordovia|Saransk|Republic
North Ossetia–Alania|Vladikavkaz|Republic
Sakha (Yakutia)|Yakutsk|Republic
Tatarstan|Kazan|Republic
Tuva|Kyzyl|Republic
Udmurtia|Izhevsk|Republic
Altai Krai|Barnaul|Krai
Kamchatka Krai|Petropavlovsk-Kamchatsky|Krai
Khabarovsk Krai|Khabarovsk|Krai
Krasnodar Krai|Krasnodar|Krai
Krasnoyarsk Krai|Krasnoyarsk|Krai
Perm Krai|Perm|Krai
Primorsky Krai|Vladivostok|Krai
Stavropol Krai|Stavropol|Krai
Zabaykalsky Krai|Chita|Krai
Amur Oblast|Blagoveshchensk|Oblast
Arkhangelsk Oblast|Arkhangelsk|Oblast
Astrakhan Oblast|Astrakhan|Oblast
Belgorod Oblast|Belgorod|Oblast
Bryansk Oblast|Bryansk|Oblast
Chelyabinsk Oblast|Chelyabinsk|Oblast
Irkutsk Oblast|Irkutsk|Oblast
Ivanovo Oblast|Ivanovo|Oblast
Kaliningrad Oblast|Kaliningrad|Oblast
Kaluga Oblast|Kaluga|Oblast
Kemerovo Oblast|Kemerovo|Oblast
Kirov Oblast|Kirov|Oblast
Kostroma Oblast|Kostroma|Oblast
Kurgan Oblast|Kurgan|Oblast
Kursk Oblast|Kursk|Oblast
Leningrad Oblast|Gatchina|Oblast
Lipetsk Oblast|Lipetsk|Oblast
Magadan Oblast|Magadan|Oblast
Moscow Oblast|Moscow|Oblast
Murmansk Oblast|Murmansk|Oblast
Nizhny Novgorod Oblast|Nizhny Novgorod|Oblast
Novgorod Oblast|Veliky Novgorod|Oblast
Novosibirsk Oblast|Novosibirsk|Oblast
Omsk Oblast|Omsk|Oblast
Orenburg Oblast|Orenburg|Oblast
Oryol Oblast|Oryol|Oblast
Penza Oblast|Penza|Oblast
Pskov Oblast|Pskov|Oblast
Rostov Oblast|Rostov-on-Don|Oblast
Ryazan Oblast|Ryazan|Oblast
Sakhalin Oblast|Yuzhno-Sakhalinsk|Oblast
Samara Oblast|Samara|Oblast
Saratov Oblast|Saratov|Oblast
Smolensk Oblast|Smolensk|Oblast
Sverdlovsk Oblast|Yekaterinburg|Oblast
Tambov Oblast|Tambov|Oblast
Tver Oblast|Tver|Oblast
Tomsk Oblast|Tomsk|Oblast
Tula Oblast|Tula|Oblast
Tyumen Oblast|Tyumen|Oblast
Ulyanovsk Oblast|Ulyanovsk|Oblast
Vladimir Oblast|Vladimir|Oblast
Volgograd Oblast|Volgograd|Oblast
Vologda Oblast|Vologda|Oblast
Voronezh Oblast|Voronezh|Oblast
Yaroslavl Oblast|Yaroslavl|Oblast
Moscow|Moscow|Federal city
Saint Petersburg|Saint Petersburg|Federal city
Jewish Autonomous Oblast|Birobidzhan|Autonomous oblast
Chukotka Autonomous Okrug|Anadyr|Autonomous okrug
Khanty-Mansi Autonomous Okrug–Yugra|Khanty-Mansiysk|Autonomous okrug
Nenets Autonomous Okrug|Naryan-Mar|Autonomous okrug
Yamalo-Nenets Autonomous Okrug|Salekhard|Autonomous okrug
`),
  },
  {
    country: 'Japan',
    region: 'Asia',
    rows: rows(`
Aichi|Nagoya|Prefecture
Akita|Akita|Prefecture
Aomori|Aomori|Prefecture
Chiba|Chiba|Prefecture
Ehime|Matsuyama|Prefecture
Fukui|Fukui|Prefecture
Fukuoka|Fukuoka|Prefecture
Fukushima|Fukushima|Prefecture
Gifu|Gifu|Prefecture
Gunma|Maebashi|Prefecture
Hiroshima|Hiroshima|Prefecture
Hokkaido|Sapporo|Prefecture
Hyogo|Kobe|Prefecture
Ibaraki|Mito|Prefecture
Ishikawa|Kanazawa|Prefecture
Iwate|Morioka|Prefecture
Kagawa|Takamatsu|Prefecture
Kagoshima|Kagoshima|Prefecture
Kanagawa|Yokohama|Prefecture
Kochi|Kochi|Prefecture
Kumamoto|Kumamoto|Prefecture
Kyoto|Kyoto|Prefecture
Mie|Tsu|Prefecture
Miyagi|Sendai|Prefecture
Miyazaki|Miyazaki|Prefecture
Nagano|Nagano|Prefecture
Nagasaki|Nagasaki|Prefecture
Nara|Nara|Prefecture
Niigata|Niigata|Prefecture
Oita|Oita|Prefecture
Okayama|Okayama|Prefecture
Okinawa|Naha|Prefecture
Osaka|Osaka|Prefecture
Saga|Saga|Prefecture
Saitama|Saitama|Prefecture
Shiga|Otsu|Prefecture
Shimane|Matsue|Prefecture
Shizuoka|Shizuoka|Prefecture
Tochigi|Utsunomiya|Prefecture
Tokushima|Tokushima|Prefecture
Tokyo|Tokyo|Prefecture
Tottori|Tottori|Prefecture
Toyama|Toyama|Prefecture
Wakayama|Wakayama|Prefecture
Yamagata|Yamagata|Prefecture
Yamaguchi|Yamaguchi|Prefecture
Yamanashi|Kofu|Prefecture
`),
  },
  {
    country: 'Canada',
    region: 'Americas',
    rows: rows(`
Alberta|Edmonton|Province
British Columbia|Victoria|Province
Manitoba|Winnipeg|Province
New Brunswick|Fredericton|Province
Newfoundland and Labrador|St. John's|Province
Nova Scotia|Halifax|Province
Ontario|Toronto|Province
Prince Edward Island|Charlottetown|Province
Quebec|Quebec City|Province
Saskatchewan|Regina|Province
Northwest Territories|Yellowknife|Territory
Nunavut|Iqaluit|Territory
Yukon|Whitehorse|Territory
`),
  },
  {
    country: 'Germany',
    region: 'Europe',
    rows: rows(`
Baden-Württemberg|Stuttgart|State
Bavaria|Munich|State
Berlin|Berlin|State
Brandenburg|Potsdam|State
Bremen|Bremen|State
Hamburg|Hamburg|State
Hesse|Wiesbaden|State
Lower Saxony|Hanover|State
Mecklenburg-Western Pomerania|Schwerin|State
North Rhine-Westphalia|Düsseldorf|State
Rhineland-Palatinate|Mainz|State
Saarland|Saarbrücken|State
Saxony|Dresden|State
Saxony-Anhalt|Magdeburg|State
Schleswig-Holstein|Kiel|State
Thuringia|Erfurt|State
`),
  },
  {
    country: 'South Africa',
    region: 'Africa',
    rows: rows(`
Eastern Cape|Bhisho|Province
Free State|Bloemfontein|Province
Gauteng|Johannesburg|Province
KwaZulu-Natal|Pietermaritzburg|Province
Limpopo|Polokwane|Province
Mpumalanga|Mbombela|Province
Northern Cape|Kimberley|Province
North West|Mahikeng|Province
Western Cape|Cape Town|Province
`),
  },
];

const scopeNote = {
  Russia: 'This catalog follows the 83 internationally recognized Russian federal subjects and does not include Russian-claimed Ukrainian territories outside Russia’s internationally recognized borders.',
  China: 'China’s official provincial-level list includes Taiwan; this note labels the political status clearly because Taiwan is self-governed and administered separately from the mainland.',
};

function makePreset({ country, region, name, capital, type }) {
  const caveat = scopeNote[country];
  const title = `Geography of ${name}, ${country}`;
  const slug = `subdivision-${slugify(country)}-${slugify(name)}`;
  const base = {
    slug,
    category: 'geo-subdivision',
    country,
    region,
    subregion: type,
    subdivision: name,
    subdivisionType: type,
    title,
  };
  const generated = GENERATED_SUBDIVISION_NOTES[slug];
  if (generated) {
    return {
      ...base,
      cues: generated.cues,
      mainNotes: caveat
        ? `${generated.mainNotes}\n\n## Scope note\n${caveat}`
        : generated.mainNotes,
      summary: generated.summary,
    };
  }
  return {
    ...base,
    cues: [
      `What is the administrative center of ${name}?`,
      `What kind of first-level subdivision is ${name}?`,
      `Which country includes ${name}?`,
      `Where is ${name} located within ${country}?`,
      `Which physical features and climate patterns shape ${name}?`,
      `Which neighboring subdivisions are closest to ${name}?`,
    ],
    mainNotes: `## Administrative identity
${name} is a first-level ${type.toLowerCase()} of ${country}. Its administrative center is **${capital}**.

## Geographic study frame
Place ${name} on a map of ${country}, then compare its terrain, climate, waterways, coastlines, and settlement pattern with neighboring first-level subdivisions. The administrative center is a useful anchor, but it may not be the largest city or the only important urban area.

${caveat ? `## Scope note\n${caveat}\n\n` : ''}## Quick facts
- Country: ${country}
- First-level unit: ${name}
- Type: ${type}
- Administrative center: ${capital}`,
    summary: `${name} is a first-level ${type.toLowerCase()} of ${country}. Its administrative center is ${capital}; use the note as a map-study anchor for comparing the unit with its neighbors.`,
  };
}

// Raw country/row groups, used by scripts/generateSubdivisionNotes.js.
export const SUBDIVISION_GROUPS = subdivisionGroups;

export const SUBDIVISION_GEO_NOTES = subdivisionGroups.flatMap(group => (
  group.rows.map(({ name, capital, type }) => makePreset({
    country: group.country,
    region: group.region,
    name,
    capital,
    type,
  }))
));
