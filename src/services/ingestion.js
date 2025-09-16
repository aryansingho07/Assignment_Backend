import axios from "axios";
import * as cheerio from "cheerio";
import logger from "../utils/logger.js";

export class IngestionService {
  constructor() {
    this.newsAPIs = [
      {
        name: "NewsAPI",
        url: "https://newsapi.org/v2/top-headlines",
        apiKey: process.env.NEWS_API_KEY,
        params: {
          country: "us",
          pageSize: 20,
          category: "general",
        },
      },
      {
        name: "Guardian",
        url: "https://content.guardianapis.com/search",
        apiKey: process.env.GUARDIAN_API_KEY,
        params: {
          "page-size": 15,
          "show-fields": "bodyText,headline,thumbnail",
        },
      },
    ];
  }

  async fetchLatestNews() {
    const allArticles = [];

    // Try API sources first
    logger.info("Fetching articles from API sources...");
    for (const api of this.newsAPIs) {
      try {
        const articles = await this.fetchFromSource(api);
        allArticles.push(...articles);
        logger.info(`Fetched ${articles.length} articles from ${api.name}`);
      } catch (error) {
        logger.warn(`Failed to fetch from ${api.name}:`, error.message);
      }
    }

    // Always fetch from RSS feeds for comprehensive coverage
    logger.info("Fetching articles from RSS feeds...");
    const rssArticles = await this.fetchFromRSSFeeds();
    allArticles.push(...rssArticles);

    // Remove duplicates and limit to 100,000 articles
    const uniqueArticles = this.removeDuplicates(allArticles);
    const limitedArticles = uniqueArticles.slice(0, 100000);

    logger.info(`Total articles collected: ${limitedArticles.length}`);
    return limitedArticles;
  }

  async fetchFromSource(api) {
    if (!api.apiKey) {
      logger.warn(`No API key for ${api.name}`);
      return [];
    }

    const params = {
      ...api.params,
      apiKey: api.apiKey,
    };

    const response = await axios.get(api.url, { params, timeout: 10000 });

    if (api.name === "NewsAPI") {
      return this.parseNewsAPI(response.data);
    } else if (api.name === "Guardian") {
      return this.parseGuardianAPI(response.data);
    }

    return [];
  }

  parseNewsAPI(data) {
    if (!data.articles) return [];

    return data.articles
      .filter(
        (article) =>
          article.title &&
          article.content &&
          !article.title.includes("[Removed]"),
      )
      .map((article) => ({
        title: article.title,
        content: article.content || article.description || "",
        url: article.url,
        source: article.source?.name || "NewsAPI",
        publishedAt: new Date(article.publishedAt),
        author: article.author,
        description: article.description,
        image: article.urlToImage,
      }));
  }

  parseGuardianAPI(data) {
    if (!data.response?.results) return [];

    return data.response.results
      .filter((article) => article.fields?.bodyText)
      .map((article) => ({
        title: article.fields?.headline || article.webTitle,
        content: article.fields?.bodyText || "",
        url: article.webUrl,
        source: "The Guardian",
        publishedAt: new Date(article.webPublicationDate),
        author: article.fields?.byline,
        description: article.fields?.trailText,
        image: article.fields?.thumbnail,
      }));
  }

  async fetchFromRSSFeeds() {
    // Add delay between requests to avoid rate limiting
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const feedsByCountry = {
      us: [
        // New York Times
        "https://rss.nytimes.com/services/xml/rss/nyt/US.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
        "https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml",

        // CNN
        "https://feeds.cnn.com/cnn_us.rss",
        "https://feeds.cnn.com/cnn_world.rss",
        "https://feeds.cnn.com/cnn_politics.rss",
        "https://feeds.cnn.com/cnn_business.rss",
        "https://feeds.cnn.com/cnn_tech.rss",
        "https://feeds.cnn.com/cnn_health.rss",
        "https://feeds.cnn.com/cnn_entertainment.rss",
        "https://feeds.cnn.com/cnn_travel.rss",
        "https://feeds.cnn.com/cnn_living.rss",
        "https://feeds.cnn.com/cnn_opinion.rss",

        // Reuters
        "https://feeds.reuters.com/Reuters/domesticNews",
        "https://feeds.reuters.com/Reuters/worldNews",
        "https://feeds.reuters.com/Reuters/businessNews",
        "https://feeds.reuters.com/Reuters/technologyNews",
        "https://feeds.reuters.com/Reuters/entertainmentNews",
        "https://feeds.reuters.com/Reuters/sportsNews",
        "https://feeds.reuters.com/Reuters/healthNews",
        "https://feeds.reuters.com/Reuters/scienceNews",
        "https://feeds.reuters.com/Reuters/politicsNews",
        "https://feeds.reuters.com/Reuters/oddlyEnoughNews",

        // Associated Press
        "https://feeds.apnews.com/apf-usnews",
        "https://feeds.apnews.com/apf-worldnews",
        "https://feeds.apnews.com/apf-politics",
        "https://feeds.apnews.com/apf-business",
        "https://feeds.apnews.com/apf-technology",
        "https://feeds.apnews.com/apf-sports",
        "https://feeds.apnews.com/apf-entertainment",
        "https://feeds.apnews.com/apf-health",
        "https://feeds.apnews.com/apf-science",
        "https://feeds.apnews.com/apf-oddities",

        // NPR
        "https://www.npr.org/rss/rss.php?id=1001",
        "https://www.npr.org/rss/rss.php?id=1003",
        "https://www.npr.org/rss/rss.php?id=1004",
        "https://www.npr.org/rss/rss.php?id=1006",
        "https://www.npr.org/rss/rss.php?id=1007",
        "https://www.npr.org/rss/rss.php?id=1008",
        "https://www.npr.org/rss/rss.php?id=1009",
        "https://www.npr.org/rss/rss.php?id=1012",
        "https://www.npr.org/rss/rss.php?id=1013",
        "https://www.npr.org/rss/rss.php?id=1014",

        // Fox News
        "https://feeds.foxnews.com/foxnews/national",
        "https://feeds.foxnews.com/foxnews/politics",
        "https://feeds.foxnews.com/foxnews/world",
        "https://feeds.foxnews.com/foxnews/business",
        "https://feeds.foxnews.com/foxnews/tech",
        "https://feeds.foxnews.com/foxnews/health",
        "https://feeds.foxnews.com/foxnews/entertainment",
        "https://feeds.foxnews.com/foxnews/sports",
        "https://feeds.foxnews.com/foxnews/opinion",
        "https://feeds.foxnews.com/foxnews/lifestyle",

        // CBS News
        "https://www.cbsnews.com/latest/rss/us/",
        "https://www.cbsnews.com/latest/rss/world/",
        "https://www.cbsnews.com/latest/rss/politics/",
        "https://www.cbsnews.com/latest/rss/business/",
        "https://www.cbsnews.com/latest/rss/technology/",
        "https://www.cbsnews.com/latest/rss/health/",
        "https://www.cbsnews.com/latest/rss/entertainment/",
        "https://www.cbsnews.com/latest/rss/sports/",
        "https://www.cbsnews.com/latest/rss/science/",
        "https://www.cbsnews.com/latest/rss/space/",

        // NBC News
        "https://www.nbcnews.com/id/3032091/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032107/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032525/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032076/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032121/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032071/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032070/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032072/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032073/device/rss/rss.xml",
        "https://www.nbcnews.com/id/3032074/device/rss/rss.xml",

        // USA Today
        "https://www.usatoday.com/rss/news/",
        "https://www.usatoday.com/rss/world/",
        "https://www.usatoday.com/rss/politics/",
        "https://www.usatoday.com/rss/business/",
        "https://www.usatoday.com/rss/technology/",
        "https://www.usatoday.com/rss/health/",
        "https://www.usatoday.com/rss/entertainment/",
        "https://www.usatoday.com/rss/sports/",
        "https://www.usatoday.com/rss/life/",
        "https://www.usatoday.com/rss/opinion/",

        // The Hill
        "https://thehill.com/feed/",
        "https://thehill.com/policy/feed/",
        "https://thehill.com/homenews/feed/",
        "https://thehill.com/business/feed/",
        "https://thehill.com/regulation/feed/",
        "https://thehill.com/defense/feed/",
        "https://thehill.com/healthcare/feed/",
        "https://thehill.com/energy/feed/",
        "https://thehill.com/transportation/feed/",
        "https://thehill.com/education/feed/",

        // Politico
        "https://www.politico.com/rss/politics-news.xml",
        "https://www.politico.com/rss/congress.xml",
        "https://www.politico.com/rss/playbook.xml",
        "https://www.politico.com/rss/playbook-pm.xml",
        "https://www.politico.com/rss/playbook-deep-dive.xml",
        "https://www.politico.com/rss/playbook-west.xml",
        "https://www.politico.com/rss/playbook-europe.xml",
        "https://www.politico.com/rss/playbook-illinois.xml",
        "https://www.politico.com/rss/playbook-new-york.xml",
        "https://www.politico.com/rss/playbook-florida.xml",

        // Los Angeles Times
        "https://www.latimes.com/local/rss2.0.xml",
        "https://www.latimes.com/world-nation/rss2.0.xml",
        "https://www.latimes.com/politics/rss2.0.xml",
        "https://www.latimes.com/business/rss2.0.xml",
        "https://www.latimes.com/technology/rss2.0.xml",
        "https://www.latimes.com/health/rss2.0.xml",
        "https://www.latimes.com/entertainment/rss2.0.xml",
        "https://www.latimes.com/sports/rss2.0.xml",
        "https://www.latimes.com/science/rss2.0.xml",
        "https://www.latimes.com/opinion/rss2.0.xml",

        // Chicago Tribune
        "https://www.chicagotribune.com/arcio/rss/category/us-world/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/politics/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/business/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/technology/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/health/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/entertainment/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/sports/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/science/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/opinion/?outputType=xml",
        "https://www.chicagotribune.com/arcio/rss/category/lifestyle/?outputType=xml",
      ],
      uk: [
        // BBC UK
        "https://feeds.bbci.co.uk/news/uk/rss.xml",
        "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "https://feeds.bbci.co.uk/news/business/rss.xml",
        "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "https://feeds.bbci.co.uk/news/health/rss.xml",
        "https://feeds.bbci.co.uk/news/entertainment/rss.xml",
        "https://feeds.bbci.co.uk/news/sport/rss.xml",
        "https://feeds.bbci.co.uk/news/science/rss.xml",
        "https://feeds.bbci.co.uk/news/education/rss.xml",
        "https://feeds.bbci.co.uk/news/world/rss.xml",

        // The Guardian
        "https://www.theguardian.com/uk-news/rss",
        "https://www.theguardian.com/world/rss",
        "https://www.theguardian.com/politics/rss",
        "https://www.theguardian.com/business/rss",
        "https://www.theguardian.com/technology/rss",
        "https://www.theguardian.com/health/rss",
        "https://www.theguardian.com/entertainment/rss",
        "https://www.theguardian.com/sport/rss",
        "https://www.theguardian.com/science/rss",
        "https://www.theguardian.com/education/rss",

        // Other UK sources
        "https://www.independent.co.uk/news/uk/rss",
        "https://www.telegraph.co.uk/news/rss.xml",
        "https://www.dailymail.co.uk/news/index.rss",
        "https://www.mirror.co.uk/news/rss.xml",
        "https://www.express.co.uk/rss.xml",
        "https://www.standard.co.uk/rss",
        "https://www.ft.com/rss",
        "https://www.economist.com/rss",
        "https://www.spectator.co.uk/rss",
        "https://www.newstatesman.com/rss",
      ],
      in: [
        // Times of India
        "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/1221656.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/1898055.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms",
        "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms",

        // The Hindu
        "https://www.thehindu.com/news/feeder/default.rss",
        "https://www.thehindu.com/business/feeder/default.rss",
        "https://www.thehindu.com/sport/feeder/default.rss",
        "https://www.thehindu.com/entertainment/feeder/default.rss",
        "https://www.thehindu.com/opinion/feeder/default.rss",
        "https://www.thehindu.com/sci-tech/feeder/default.rss",
        "https://www.thehindu.com/life-and-style/feeder/default.rss",
        "https://www.thehindu.com/education/feeder/default.rss",
        "https://www.thehindu.com/health/feeder/default.rss",
        "https://www.thehindu.com/books/feeder/default.rss",

        // Indian Express
        "https://indianexpress.com/section/india/feed/",
        "https://indianexpress.com/section/world/feed/",
        "https://indianexpress.com/section/politics/feed/",
        "https://indianexpress.com/section/business/feed/",
        "https://indianexpress.com/section/technology/feed/",
        "https://indianexpress.com/section/sports/feed/",
        "https://indianexpress.com/section/entertainment/feed/",
        "https://indianexpress.com/section/health/feed/",
        "https://indianexpress.com/section/science/feed/",
        "https://indianexpress.com/section/education/feed/",

        // Hindustan Times
        "https://feeds.hindustantimes.com/HT-HomePage-TopStories",
        "https://feeds.hindustantimes.com/HT-World",
        "https://feeds.hindustantimes.com/HT-Politics",
        "https://feeds.hindustantimes.com/HT-Business",
        "https://feeds.hindustantimes.com/HT-Technology",
        "https://feeds.hindustantimes.com/HT-Sports",
        "https://feeds.hindustantimes.com/HT-Entertainment",
        "https://feeds.hindustantimes.com/HT-Health",
        "https://feeds.hindustantimes.com/HT-Science",
        "https://feeds.hindustantimes.com/HT-Education",
      ],
      ca: [
        // CBC
        "https://www.cbc.ca/cmlink/rss-canada",
        "https://www.cbc.ca/cmlink/rss-world",
        "https://www.cbc.ca/cmlink/rss-politics",
        "https://www.cbc.ca/cmlink/rss-business",
        "https://www.cbc.ca/cmlink/rss-technology",
        "https://www.cbc.ca/cmlink/rss-sports",
        "https://www.cbc.ca/cmlink/rss-entertainment",
        "https://www.cbc.ca/cmlink/rss-health",
        "https://www.cbc.ca/cmlink/rss-science",
        "https://www.cbc.ca/cmlink/rss-education",

        // Global News
        "https://globalnews.ca/feed/",
        "https://globalnews.ca/world/feed/",
        "https://globalnews.ca/politics/feed/",
        "https://globalnews.ca/business/feed/",
        "https://globalnews.ca/technology/feed/",
        "https://globalnews.ca/sports/feed/",
        "https://globalnews.ca/entertainment/feed/",
        "https://globalnews.ca/health/feed/",
        "https://globalnews.ca/science/feed/",
        "https://globalnews.ca/education/feed/",

        // CTV News
        "https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009",
        "https://www.ctvnews.ca/rss/ctvnews-ca-world-public-rss-1.822010",
        "https://www.ctvnews.ca/rss/ctvnews-ca-politics-public-rss-1.822011",
        "https://www.ctvnews.ca/rss/ctvnews-ca-business-public-rss-1.822012",
        "https://www.ctvnews.ca/rss/ctvnews-ca-technology-public-rss-1.822013",
        "https://www.ctvnews.ca/rss/ctvnews-ca-sports-public-rss-1.822014",
        "https://www.ctvnews.ca/rss/ctvnews-ca-entertainment-public-rss-1.822015",
        "https://www.ctvnews.ca/rss/ctvnews-ca-health-public-rss-1.822016",
        "https://www.ctvnews.ca/rss/ctvnews-ca-science-public-rss-1.822017",
        "https://www.ctvnews.ca/rss/ctvnews-ca-education-public-rss-1.822018",
      ],
      au: [
        // ABC Australia
        "https://www.abc.net.au/news/feed/51120/rss.xml",
        "https://www.abc.net.au/news/feed/46182/rss.xml",
        "https://www.abc.net.au/news/feed/46184/rss.xml",
        "https://www.abc.net.au/news/feed/46186/rss.xml",
        "https://www.abc.net.au/news/feed/46188/rss.xml",
        "https://www.abc.net.au/news/feed/46190/rss.xml",
        "https://www.abc.net.au/news/feed/46192/rss.xml",
        "https://www.abc.net.au/news/feed/46194/rss.xml",
        "https://www.abc.net.au/news/feed/46196/rss.xml",
        "https://www.abc.net.au/news/feed/46198/rss.xml",

        // SBS
        "https://www.sbs.com.au/news/topic/latest/rss.xml",
        "https://www.sbs.com.au/news/topic/world/rss.xml",
        "https://www.sbs.com.au/news/topic/politics/rss.xml",
        "https://www.sbs.com.au/news/topic/business/rss.xml",
        "https://www.sbs.com.au/news/topic/technology/rss.xml",
        "https://www.sbs.com.au/news/topic/sports/rss.xml",
        "https://www.sbs.com.au/news/topic/entertainment/rss.xml",
        "https://www.sbs.com.au/news/topic/health/rss.xml",
        "https://www.sbs.com.au/news/topic/science/rss.xml",
        "https://www.sbs.com.au/news/topic/education/rss.xml",

        // Other Australian sources
        "https://www.theaustralian.com.au/rss",
        "https://www.smh.com.au/rss",
        "https://www.theage.com.au/rss",
        "https://www.news.com.au/rss",
        "https://www.dailytelegraph.com.au/rss",
        "https://www.couriermail.com.au/rss",
        "https://www.adelaidenow.com.au/rss",
        "https://www.perthnow.com.au/rss",
        "https://www.heraldsun.com.au/rss",
        "https://www.canberratimes.com.au/rss",
      ],
      de: [
        // Deutsche Welle
        "https://www.dw.com/en/top-stories/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/world/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/politics/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/business/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/technology/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/sports/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/entertainment/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/health/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/science/s-9097?maca=en-rss-en-all-1573-rdf",
        "https://www.dw.com/en/education/s-9097?maca=en-rss-en-all-1573-rdf",

        // Der Spiegel
        "https://www.spiegel.de/international/index.rss",
        "https://www.spiegel.de/politik/index.rss",
        "https://www.spiegel.de/wirtschaft/index.rss",
        "https://www.spiegel.de/technologie/index.rss",
        "https://www.spiegel.de/sport/index.rss",
        "https://www.spiegel.de/kultur/index.rss",
        "https://www.spiegel.de/gesundheit/index.rss",
        "https://www.spiegel.de/wissenschaft/index.rss",
        "https://www.spiegel.de/panorama/index.rss",
        "https://www.spiegel.de/leben/index.rss",
      ],
      fr: [
        // France 24
        "https://www.france24.com/en/rss",
        "https://www.france24.com/en/world/rss",
        "https://www.france24.com/en/politics/rss",
        "https://www.france24.com/en/business/rss",
        "https://www.france24.com/en/technology/rss",
        "https://www.france24.com/en/sports/rss",
        "https://www.france24.com/en/entertainment/rss",
        "https://www.france24.com/en/health/rss",
        "https://www.france24.com/en/science/rss",
        "https://www.france24.com/en/education/rss",

        // Le Monde
        "https://www.lemonde.fr/en/rss/full.xml",
        "https://www.lemonde.fr/en/world/rss/full.xml",
        "https://www.lemonde.fr/en/politics/rss/full.xml",
        "https://www.lemonde.fr/en/business/rss/full.xml",
        "https://www.lemonde.fr/en/technology/rss/full.xml",
        "https://www.lemonde.fr/en/sports/rss/full.xml",
        "https://www.lemonde.fr/en/entertainment/rss/full.xml",
        "https://www.lemonde.fr/en/health/rss/full.xml",
        "https://www.lemonde.fr/en/science/rss/full.xml",
        "https://www.lemonde.fr/en/education/rss/full.xml",
      ],
      jp: [
        // NHK World
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/rss.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/world.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/politics.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/business.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/technology.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/sports.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/entertainment.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/health.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/science.xml",
        "https://www3.nhk.or.jp/nhkworld/en/news/feeds/education.xml",

        // Japan Times
        "https://www.japantimes.co.jp/news/feed/",
        "https://www.japantimes.co.jp/world/feed/",
        "https://www.japantimes.co.jp/politics/feed/",
        "https://www.japantimes.co.jp/business/feed/",
        "https://www.japantimes.co.jp/technology/feed/",
        "https://www.japantimes.co.jp/sports/feed/",
        "https://www.japantimes.co.jp/entertainment/feed/",
        "https://www.japantimes.co.jp/health/feed/",
        "https://www.japantimes.co.jp/science/feed/",
        "https://www.japantimes.co.jp/education/feed/",
      ],
      br: [
        // Reuters Brazil
        "https://www.reuters.com/brandstudio/brazil/feed/",
        "https://www.reuters.com/brandstudio/brazil/world/feed/",
        "https://www.reuters.com/brandstudio/brazil/politics/feed/",
        "https://www.reuters.com/brandstudio/brazil/business/feed/",
        "https://www.reuters.com/brandstudio/brazil/technology/feed/",
        "https://www.reuters.com/brandstudio/brazil/sports/feed/",
        "https://www.reuters.com/brandstudio/brazil/entertainment/feed/",
        "https://www.reuters.com/brandstudio/brazil/health/feed/",
        "https://www.reuters.com/brandstudio/brazil/science/feed/",
        "https://www.reuters.com/brandstudio/brazil/education/feed/",

        // G1 Globo
        "https://g1.globo.com/rss/g1/",
        "https://g1.globo.com/rss/g1/mundo/",
        "https://g1.globo.com/rss/g1/politica/",
        "https://g1.globo.com/rss/g1/economia/",
        "https://g1.globo.com/rss/g1/tecnologia/",
        "https://g1.globo.com/rss/g1/esporte/",
        "https://g1.globo.com/rss/g1/entretenimento/",
        "https://g1.globo.com/rss/g1/saude/",
        "https://g1.globo.com/rss/g1/ciencia/",
        "https://g1.globo.com/rss/g1/educacao/",
      ],
      world: [
        // Reuters World
        "https://feeds.reuters.com/reuters/worldNews",
        "https://feeds.reuters.com/reuters/politicsNews",
        "https://feeds.reuters.com/reuters/businessNews",
        "https://feeds.reuters.com/reuters/technologyNews",
        "https://feeds.reuters.com/reuters/sportsNews",
        "https://feeds.reuters.com/reuters/entertainmentNews",
        "https://feeds.reuters.com/reuters/healthNews",
        "https://feeds.reuters.com/reuters/scienceNews",
        "https://feeds.reuters.com/reuters/oddlyEnoughNews",
        "https://feeds.reuters.com/reuters/peopleNews",

        // Associated Press
        "https://apnews.com/apf-topnews",
        "https://apnews.com/apf-worldnews",
        "https://apnews.com/apf-politics",
        "https://apnews.com/apf-business",
        "https://apnews.com/apf-technology",
        "https://apnews.com/apf-sports",
        "https://apnews.com/apf-entertainment",
        "https://apnews.com/apf-health",
        "https://apnews.com/apf-science",
        "https://apnews.com/apf-oddities",

        // Al Jazeera
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://www.aljazeera.com/xml/rss/world.xml",
        "https://www.aljazeera.com/xml/rss/politics.xml",
        "https://www.aljazeera.com/xml/rss/business.xml",
        "https://www.aljazeera.com/xml/rss/technology.xml",
        "https://www.aljazeera.com/xml/rss/sports.xml",
        "https://www.aljazeera.com/xml/rss/entertainment.xml",
        "https://www.aljazeera.com/xml/rss/health.xml",
        "https://www.aljazeera.com/xml/rss/science.xml",
        "https://www.aljazeera.com/xml/rss/education.xml",
      ],
      tech: [
        // The Verge
        "https://www.theverge.com/rss/index.xml",
        "https://www.theverge.com/rss/world/index.xml",
        "https://www.theverge.com/rss/politics/index.xml",
        "https://www.theverge.com/rss/business/index.xml",
        "https://www.theverge.com/rss/technology/index.xml",
        "https://www.theverge.com/rss/sports/index.xml",
        "https://www.theverge.com/rss/entertainment/index.xml",
        "https://www.theverge.com/rss/health/index.xml",
        "https://www.theverge.com/rss/science/index.xml",
        "https://www.theverge.com/rss/education/index.xml",

        // TechCrunch
        "https://techcrunch.com/feed/",
        "https://techcrunch.com/category/world/feed/",
        "https://techcrunch.com/category/politics/feed/",
        "https://techcrunch.com/category/business/feed/",
        "https://techcrunch.com/category/technology/feed/",
        "https://techcrunch.com/category/sports/feed/",
        "https://techcrunch.com/category/entertainment/feed/",
        "https://techcrunch.com/category/health/feed/",
        "https://techcrunch.com/category/science/feed/",
        "https://techcrunch.com/category/education/feed/",

        // Other tech sources
        "https://www.wired.com/feed/rss",
        "https://www.engadget.com/rss.xml",
        "https://www.ars-technica.com/feed/",
        "https://www.gizmodo.com/rss",
        "https://www.mashable.com/rss",
        "https://www.cnet.com/rss/news/",
        "https://www.zdnet.com/rss/",
        "https://www.pcworld.com/rss/",
        "https://www.macworld.com/rss/",
        "https://www.techradar.com/rss/",
      ],
    };

    const envFeeds = (process.env.RSS_FEEDS || "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    const selectedCountries = (
      process.env.RSS_COUNTRIES || "us,uk,in,ca,au,de,fr,jp,br,world,tech"
    )
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    let rssFeeds = [];
    if (envFeeds.length > 0) {
      rssFeeds = envFeeds;
    } else {
      const set = new Set();
      selectedCountries.forEach((code) => {
        (feedsByCountry[code] || []).forEach((u) => set.add(u));
      });
      rssFeeds = Array.from(set);
    }

    const maxPerFeed = parseInt(process.env.RSS_MAX_PER_FEED || "1000", 10);
    const maxTotal = parseInt(process.env.RSS_MAX_TOTAL || "100000", 10);

    const articles = [];

    for (const feedUrl of rssFeeds) {
      if (articles.length >= maxTotal) break;
      try {
        const response = await axios.get(feedUrl, {
          timeout: 15000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
          },
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        let countForFeed = 0;

        $("item").each((i, item) => {
          if (countForFeed >= maxPerFeed || articles.length >= maxTotal)
            return false;

          const $item = $(item);
          const title = $item.find("title").text().trim();
          const description = $item.find("description").text().trim();
          const link = $item.find("link").text().trim();
          const pubDate = $item.find("pubDate").text().trim();

          if (title && (description || link)) {
            articles.push({
              title,
              content: description || title,
              url: link,
              source: this.extractSourceFromURL(feedUrl),
              publishedAt: new Date(pubDate || Date.now()),
              author: null,
              description: description || title,
              image: null,
            });
            countForFeed += 1;
          }
        });

        logger.info(`Fetched ${countForFeed} items from RSS: ${feedUrl}`);

        // Add delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        logger.warn(`Failed to fetch RSS feed ${feedUrl}:`, error.message);
      }
    }

    return articles;
  }

  extractSourceFromURL(url) {
    if (url.includes("bbc")) return "BBC News";
    if (url.includes("cnn")) return "CNN";
    if (url.includes("reuters")) return "Reuters";
    return "RSS Feed";
  }

  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter((article) => {
      const key = article.title.toLowerCase().substring(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  chunkContent(content, maxChunkSize = 500, overlap = 50) {
    const words = content.split(" ");
    const chunks = [];

    for (let i = 0; i < words.length; i += maxChunkSize - overlap) {
      const chunk = words.slice(i, i + maxChunkSize).join(" ");
      if (chunk.trim()) {
        chunks.push(chunk.trim());
      }
    }

    return chunks.length > 0 ? chunks : [content];
  }

  async processArticlesForEmbedding(articles) {
    const processedChunks = [];

    for (const article of articles) {
      // Combine title and content for better context
      const fullContent = `${article.title}\n\n${article.content}`;
      const chunks = this.chunkContent(fullContent);

      chunks.forEach((chunk, index) => {
        processedChunks.push({
          id: `${article.url}-${index}`,
          content: chunk,
          metadata: {
            title: article.title,
            url: article.url,
            source: article.source,
            publishedAt: article.publishedAt.toISOString(),
            author: article.author,
            description: article.description,
            image: article.image,
            chunkIndex: index,
            totalChunks: chunks.length,
          },
        });
      });
    }

    logger.info(
      `Processed ${articles.length} articles into ${processedChunks.length} chunks`,
    );
    return processedChunks;
  }
}
