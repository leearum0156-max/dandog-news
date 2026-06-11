// api/news.js - Vercel 서버리스 함수
// 구글 뉴스 RSS에서 [단독] 기사를 가져와서 DART 전체 상장사명과 매칭

const DART_API_KEY = process.env.DART_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  try {
    const rssUrl = 'https://news.google.com/rss/search?q=%5B%EB%8B%A8%EB%8F%85%5D&hl=ko&gl=KR&ceid=KR:ko&num=100';
    const rssRes = await fetch(rssUrl);
    const rssText = await rssRes.text();
    const items = parseRss(rssText);

    const stocks = await fetchDartStocks();

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

    res.status(200).json({ ok: true, count: matched.length, articles: matched, updatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

// DART API로 전체 상장사 목록 가져오기
async function fetchDartStocks() {
  const key = DART_API_KEY;
  if (!key) throw new Error('DART_API_KEY 환경변수가 없습니다');

  const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${key}&corp_cls=Y&page_count=100&page_no=1`;

  // KOSPI(Y), KOSDAQ(K) 두 시장 모두 가져오기
  const markets = [
    { cls: 'Y', label: 'KOSPI' },
    { cls: 'K', label: 'KOSDAQ' },
  ];

  const stocks = [];

  for (const { cls, label } of markets) {
    let page = 1;
    while (true) {
      const r = await fetch(
        `https://opendart.fss.or.kr/api/company.json?crtfc_key=${key}&corp_cls=${cls}&page_count=100&page_no=${page}`
      );
      const data = await r.json();
      if (data.status !== '000') break;

      for (const corp of data.list || []) {
        if (corp.stock_code && corp.corp_name) {
          stocks.push({
            name: corp.corp_name.trim(),
            code: corp.stock_code.trim(),
            market: label,
          });
        }
      }

      if (page >= data.total_page) break;
      page++;
    }
  }

  if (stocks.length === 0) return FALLBACK_STOCKS;
  return stocks;
}

function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeHtml(extract(block, 'title'));
    const link  = extract(block, 'link') || extract(block, 'guid');
    const pubDate = extract(block, 'pubDate');
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

function extract(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
  return m ? (m[1] || m[2] || '').trim() : '';
}

function decodeHtml(str) {
  return str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

function cleanTitle(title) {
  return title.replace(/\s*-\s*[^-]+$/, '').trim();
}

function cleanSource(title) {
  const m = title.match(/- (.+?)$/);
  return m ? m[1].trim() : '';
}

const FALLBACK_STOCKS = [
  {name:'삼성전자',code:'005930',market:'KOSPI'},{name:'SK하이닉스',code:'000660',market:'KOSPI'},
  {name:'LG에너지솔루션',code:'373220',market:'KOSPI'},{name:'삼성바이오로직스',code:'207940',market:'KOSPI'},
  {name:'현대차',code:'005380',market:'KOSPI'},{name:'기아',code:'000270',market:'KOSPI'},
  {name:'셀트리온',code:'068270',market:'KOSPI'},{name:'POSCO홀딩스',code:'005490',market:'KOSPI'},
  {name:'KB금융',code:'105560',market:'KOSPI'},{name:'신한지주',code:'055550',market:'KOSPI'},
  {name:'LG화학',code:'051910',market:'KOSPI'},{name:'삼성SDI',code:'006400',market:'KOSPI'},
  {name:'카카오',code:'035720',market:'KOSPI'},{name:'네이버',code:'035420',market:'KOSPI'},
  {name:'에코프로비엠',code:'247540',market:'KOSDAQ'},{name:'에코프로',code:'086520',market:'KOSDAQ'},
  {name:'HLB',code:'028300',market:'KOSDAQ'},{name:'알테오젠',code:'196170',market:'KOSDAQ'},
  {name:'크래프톤',code:'259960',market:'KOSPI'},{name:'고려아연',code:'010130',market:'KOSPI'},
];
