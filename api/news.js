// api/news.js - Vercel 서버리스 함수
// 구글 뉴스 RSS에서 [단독] 기사를 가져와서 코스피·코스닥 상장사명과 매칭

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300'); // 5분 캐시

  try {
    // 1) 구글 뉴스 RSS 가져오기
    const rssUrl = 'https://news.google.com/rss/search?q=%5B%EB%8B%A8%EB%8F%85%5D&hl=ko&gl=KR&ceid=KR:ko&num=100';
    const rssRes = await fetch(rssUrl);
    const rssText = await rssRes.text();

    // 2) XML 파싱
    const items = parseRss(rssText);

    // 3) KRX 상장사 목록 가져오기 (무료 공공 API)
    const stocks = await fetchKrxStocks();

    // 4) 기사 제목에 상장사명이 포함된 것만 필터
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

// RSS XML을 파싱해서 기사 배열로 변환
function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeHtml(extract(block, 'title'));
    const link  = extract(block, 'link') || extract(block, 'guid');
    const pubDate = extract(block, 'pubDate');
    const source  = extract(block, 'source') || extractAttr(block, 'source', 'url') || titleSource(title);
    items.push({
      title: cleanTitle(title),
      rawTitle: title,
      link,
      pubDate,
      source: cleanSource(title, source),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }
  return items;
}

function extract(str, tag) {
  const m = str.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
  return m ? (m[1] || m[2] || '').trim() : '';
}

function extractAttr(str, tag, attr) {
  const m = str.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*>`));
  return m ? m[1] : '';
}

function decodeHtml(str) {
  return str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

function cleanTitle(title) {
  return title.replace(/\s*-\s*[^-]+$/, '').trim();
}

function titleSource(title) {
  const m = title.match(/- (.+?)$/);
  return m ? m[1].trim() : '';
}

function cleanSource(title, source) {
  if (source) return source;
  const m = title.match(/- (.+?)$/);
  return m ? m[1].trim() : '';
}

// KRX 상장사 목록 가져오기
async function fetchKrxStocks() {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  const date = `${yyyy}${mm}${dd}`;

  const urls = [
    { market: 'KOSPI', url: `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=stockMkt&currentPageSize=5000&pageIndex=1` },
    { market: 'KOSDAQ', url: `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=kosdaqMkt&currentPageSize=5000&pageIndex=1` },
  ];

  const stocks = [];
  for (const { market, url } of urls) {
    try {
      const r = await fetch(url, { headers: { Referer: 'https://kind.krx.co.kr' } });
      const text = await r.text();
      // HTML 테이블 파싱
      const rows = text.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
      for (const row of rows.slice(1)) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [])
          .map(c => c.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim());
        if (cells.length >= 2) {
          const name = cells[0].trim();
          const code = cells[1].trim();
          if (name && code && /^\d{6}$/.test(code)) {
            stocks.push({ name, code, market });
          }
        }
      }
    } catch(e) {
      console.error(`${market} 목록 가져오기 실패:`, e.message);
    }
  }

  // KRX 실패 시 대형주 fallback
  if (stocks.length === 0) {
    return FALLBACK_STOCKS;
  }

  return stocks;
}

// KRX API 실패 시 대형주 fallback 목록
const FALLBACK_STOCKS = [
  {name:'삼성전자',code:'005930',market:'KOSPI'},{name:'SK하이닉스',code:'000660',market:'KOSPI'},
  {name:'LG에너지솔루션',code:'373220',market:'KOSPI'},{name:'삼성바이오로직스',code:'207940',market:'KOSPI'},
  {name:'현대차',code:'005380',market:'KOSPI'},{name:'기아',code:'000270',market:'KOSPI'},
  {name:'셀트리온',code:'068270',market:'KOSPI'},{name:'POSCO홀딩스',code:'005490',market:'KOSPI'},
  {name:'KB금융',code:'105560',market:'KOSPI'},{name:'신한지주',code:'055550',market:'KOSPI'},
  {name:'하나금융지주',code:'086790',market:'KOSPI'},{name:'LG화학',code:'051910',market:'KOSPI'},
  {name:'삼성SDI',code:'006400',market:'KOSPI'},{name:'카카오',code:'035720',market:'KOSPI'},
  {name:'네이버',code:'035420',market:'KOSPI'},{name:'현대모비스',code:'012330',market:'KOSPI'},
  {name:'삼성물산',code:'028260',market:'KOSPI'},{name:'SK이노베이션',code:'096770',market:'KOSPI'},
  {name:'LG전자',code:'066570',market:'KOSPI'},{name:'한국전력',code:'015760',market:'KOSPI'},
  {name:'에코프로비엠',code:'247540',market:'KOSDAQ'},{name:'에코프로',code:'086520',market:'KOSDAQ'},
  {name:'HLB',code:'028300',market:'KOSDAQ'},{name:'알테오젠',code:'196170',market:'KOSDAQ'},
  {name:'리가켐바이오',code:'141080',market:'KOSDAQ'},{name:'카카오게임즈',code:'293490',market:'KOSDAQ'},
  {name:'펄어비스',code:'263750',market:'KOSDAQ'},{name:'크래프톤',code:'259960',market:'KOSPI'},
  {name:'두산에너빌리티',code:'034020',market:'KOSPI'},{name:'고려아연',code:'010130',market:'KOSPI'},
];
