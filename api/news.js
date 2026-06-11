export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  try {
    const [items, stocks] = await Promise.all([
      fetchRssItems(),
      fetchDartStocks(),
    ]);

    const matched = [];
    for (const item of items) {
      const foundStocks = stocks.filter(s =>
        s.name.length >= 2 && item.title.includes(s.name)
      );
      if (foundStocks.length > 0) {
        matched.push({
          ...item,
          stocks: foundStocks.map(s => ({ name: s.name, code: s.code, market: s.market }))
        });
      }
    }

    res.status(200).json({
      ok: true,
      count: matched.length,
      stocksLoaded: stocks.length,
      articles: matched,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

async function fetchRssItems() {
  const url = 'https://news.google.com/rss/search?q=%5B%EB%8B%A8%EB%8F%85%5D&hl=ko&gl=KR&ceid=KR:ko&num=100';
  const r = await fetch(url);
  const xml = await r.text();
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const title = decodeHtml(extract(b, 'title'));
    const link = extract(b, 'link') || extract(b, 'guid');
    const pubDate = extract(b, 'pubDate');
    items.push({
      title: cleanTitle(title),
      link,
      pubDate,
      source: cleanSource(title),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }
  return items;
}

async function fetchDartStocks() {
  const key = process.env.DART_API_KEY;
  if (!key) {
    console.log('DART_API_KEY 없음 - fallback 사용');
    return FALLBACK_STOCKS;
  }

  const stocks = [];

  // DART는 페이지당 최대 100개 — 전체를 한번에 받으려면 page_count=3000으로 요청
  for (const [cls, market] of [['Y','KOSPI'],['K','KOSDAQ']]) {
    try {
      // 한 번에 최대 3000개 요청 (실제 상장사 수보다 크게 설정)
      const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${key}&corp_cls=${cls}&page_count=3000&page_no=1`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await r.json();

      console.log(`DART ${market}: status=${data.status}, total_count=${data.total_count}, list_size=${(data.list||[]).length}`);

      if (data.status !== '000') {
        console.log(`DART ${market} 오류: ${data.message}`);
        continue;
      }

      for (const corp of (data.list || [])) {
        if (corp.stock_code && corp.corp_name) {
          stocks.push({ name: corp.corp_name.trim(), code: corp.stock_code.trim(), market });
        }
      }
    } catch(e) {
      console.log(`DART ${market} 예외: ${e.message}`);
    }
  }

  console.log(`DART 총 로드: ${stocks.length}개`);
  return stocks.length > 0 ? stocks : FALLBACK_STOCKS;
}

function extract(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
  return m ? (m[1] || m[2] || '').trim() : '';
}
function decodeHtml(str) {
  return str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}
function cleanTitle(t) { return t.replace(/\s*-\s*[^-]+$/, '').trim(); }
function cleanSource(t) { const m = t.match(/- (.+?)$/); return m ? m[1].trim() : ''; }

const FALLBACK_STOCKS = [
  {name:'삼성전자',code:'005930',market:'KOSPI'},{name:'SK하이닉스',code:'000660',market:'KOSPI'},
  {name:'LG에너지솔루션',code:'373220',market:'KOSPI'},{name:'삼성바이오로직스',code:'207940',market:'KOSPI'},
  {name:'현대차',code:'005380',market:'KOSPI'},{name:'기아',code:'000270',market:'KOSPI'},
  {name:'셀트리온',code:'068270',market:'KOSPI'},{name:'POSCO홀딩스',code:'005490',market:'KOSPI'},
  {name:'KB금융',code:'105560',market:'KOSPI'},{name:'신한지주',code:'055550',market:'KOSPI'},
  {name:'LG화학',code:'051910',market:'KOSPI'},{name:'삼성SDI',code:'006400',market:'KOSPI'},
  {name:'카카오',code:'035720',market:'KOSPI'},{name:'네이버',code:'035420',market:'KOSPI'},
  {name:'현대모비스',code:'012330',market:'KOSPI'},{name:'삼성물산',code:'028260',market:'KOSPI'},
  {name:'SK이노베이션',code:'096770',market:'KOSPI'},{name:'LG전자',code:'066570',market:'KOSPI'},
  {name:'한국전력',code:'015760',market:'KOSPI'},{name:'크래프톤',code:'259960',market:'KOSPI'},
  {name:'고려아연',code:'010130',market:'KOSPI'},{name:'두산에너빌리티',code:'034020',market:'KOSPI'},
  {name:'에코프로비엠',code:'247540',market:'KOSDAQ'},{name:'에코프로',code:'086520',market:'KOSDAQ'},
  {name:'HLB',code:'028300',market:'KOSDAQ'},{name:'알테오젠',code:'196170',market:'KOSDAQ'},
  {name:'리가켐바이오',code:'141080',market:'KOSDAQ'},{name:'카카오게임즈',code:'293490',market:'KOSDAQ'},
  {name:'펄어비스',code:'263750',market:'KOSDAQ'},{name:'우리금융지주',code:'316140',market:'KOSPI'},
];
