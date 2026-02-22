export type CuratedMediaType = 'movie' | 'tv';

export interface CuratedCategoryConfig {
  slug: string;
  title: string;
  mediaType: CuratedMediaType;
  query: Record<string, string>;
  fallbackQuery?: Record<string, string>;
}

export const TOP_RATED_CATEGORY_CONFIGS: CuratedCategoryConfig[] = [
  {
    slug: 'top-rated-movies',
    title: '\u9ad8\u5206\u7535\u5f71',
    mediaType: 'movie',
    query: {
      sort_by: 'vote_average.desc',
      vote_average_gte: '7.0',
      vote_count_gte: '3000',
    },
    fallbackQuery: {
      sort_by: 'popularity.desc',
      vote_count_gte: '1000',
    },
  },
  {
    slug: 'top-rated-tvshows',
    title: '\u9ad8\u5206\u5267\u96c6',
    mediaType: 'tv',
    query: {
      sort_by: 'vote_average.desc',
      vote_average_gte: '7.0',
      vote_count_gte: '500',
    },
    fallbackQuery: {
      sort_by: 'popularity.desc',
      vote_count_gte: '300',
    },
  },
];

export const HOME_CURATED_CATEGORY_CONFIGS: CuratedCategoryConfig[] = [
  {
    slug: 'early-2000s-movies',
    title: '\u5343\u79a7\u5e74\u7535\u5f71',
    mediaType: 'movie',
    query: {
      release_from: '2000-01-01',
      release_to: '2009-12-31',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      without_genres: '10749',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'popular-movies',
    title: '\u70ed\u95e8\u7535\u5f71',
    mediaType: 'movie',
    query: {
      vote_count_gte: '500',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'popular-tvshows',
    title: '\u70ed\u95e8\u5267\u96c6',
    mediaType: 'tv',
    query: {
      with_origin_country: 'US',
      vote_count_gte: '100',
      vote_average_gte: '6.5',
      release_from: '2010-01-01',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'nolan-films',
    title: '\u8bfa\u5170\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_people: '525',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'scifi-fantasy-movies',
    title: '\u79d1\u5e7b\u5947\u5e7b\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '878|14',
      vote_count_gte: '150',
      vote_average_gte: '6.2',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'binge-worthy-series',
    title: '\u8ffd\u5267\u7cbe\u9009',
    mediaType: 'tv',
    query: {
      with_genres: '18|35|80|10759|10765',
      with_origin_country: 'US',
      vote_count_gte: '80',
      vote_average_gte: '6.5',
      release_from: '2010-01-01',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'comedy-movies',
    title: '\u559c\u5267\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '35',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      runtime_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'a24-films',
    title: 'A24 \u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_companies: '41077',
      vote_count_gte: '20',
      vote_average_gte: '5.5',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'thriller-movies',
    title: '\u60ca\u609a\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '53',
      vote_count_gte: '150',
      vote_average_gte: '6.3',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'limited-series',
    title: '\u9650\u5b9a\u5267',
    mediaType: 'tv',
    query: {
      with_type: '2',
      vote_average_gte: '7.5',
      vote_count_gte: '30',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'drama-movies',
    title: '\u5267\u60c5\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '18',
      vote_count_gte: '150',
      vote_average_gte: '6.8',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'critically-acclaimed',
    title: '\u53e3\u7891\u4f73\u4f5c',
    mediaType: 'movie',
    query: {
      vote_average_gte: '7.8',
      vote_count_gte: '1500',
      without_genres: '99,10770,10749',
      runtime_gte: '90',
      sort_by: 'vote_average.desc',
    },
  },
  {
    slug: 'eighties-movies',
    title: '80\u5e74\u4ee3\u7535\u5f71',
    mediaType: 'movie',
    query: {
      release_from: '1980-01-01',
      release_to: '1989-12-31',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'reality-tv',
    title: '\u771f\u4eba\u79c0',
    mediaType: 'tv',
    query: {
      with_genres: '10764',
      vote_count_gte: '50',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'nineties-movies',
    title: '90\u5e74\u4ee3\u7535\u5f71',
    mediaType: 'movie',
    query: {
      release_from: '1990-01-01',
      release_to: '1999-12-31',
      vote_count_gte: '150',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'romcom-movies',
    title: '\u7231\u60c5\u559c\u5267',
    mediaType: 'movie',
    query: {
      with_genres: '10749,35',
      vote_count_gte: '80',
      vote_average_gte: '6.0',
      runtime_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'docuseries',
    title: '\u7eaa\u5f55\u7247\u5267\u96c6',
    mediaType: 'tv',
    query: {
      with_genres: '99',
      vote_count_gte: '30',
      vote_average_gte: '7.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'hidden-gems',
    title: '\u51b7\u95e8\u4f73\u7247',
    mediaType: 'movie',
    query: {
      vote_average_gte: '7.3',
      vote_count_gte: '500',
      vote_count_lte: '5000',
      without_genres: '99,10770,10749',
      runtime_gte: '85',
      sort_by: 'vote_average.desc',
    },
  },
  {
    slug: 'marvel-mcu',
    title: '\u6f2b\u5a01\u7535\u5f71\u5b87\u5b99',
    mediaType: 'movie',
    query: {
      with_companies: '420',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'horror-movies',
    title: '\u6050\u6016\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '27',
      vote_count_gte: '100',
      vote_average_gte: '5.8',
      runtime_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'crime-movies',
    title: '\u72af\u7f6a\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '80',
      vote_count_gte: '150',
      vote_average_gte: '6.5',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'mystery-movies',
    title: '\u60ac\u7591\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_genres: '9648',
      vote_count_gte: '100',
      vote_average_gte: '6.3',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'warner-bros',
    title: '\u534e\u7eb3\u5144\u5f1f\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_companies: '174',
      vote_count_gte: '20',
      vote_average_gte: '5.5',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'universal-films',
    title: '\u73af\u7403\u5f71\u4e1a\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_companies: '33',
      vote_count_gte: '20',
      vote_average_gte: '5.5',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'spielberg-films',
    title: '\u65af\u76ae\u5c14\u4f2f\u683c\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_people: '488',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'scorsese-films',
    title: '\u65af\u79d1\u585e\u65af\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_people: '1032',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'fincher-films',
    title: '\u5927\u536b\u00b7\u82ac\u5947\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_people: '7467',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'villeneuve-films',
    title: '\u7ef4\u4f26\u7ebd\u74e6\u7535\u5f71',
    mediaType: 'movie',
    query: {
      with_people: '27571',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'blockbuster-hits',
    title: '\u7968\u623f\u5927\u7247',
    mediaType: 'movie',
    query: {
      vote_count_gte: '3000',
      vote_average_gte: '6.5',
      runtime_gte: '100',
      without_genres: '99,10770,10749',
      sort_by: 'revenue.desc',
    },
  },
];

export const ALL_CURATED_CATEGORY_CONFIGS: CuratedCategoryConfig[] = [
  ...TOP_RATED_CATEGORY_CONFIGS,
  ...HOME_CURATED_CATEGORY_CONFIGS,
];

const curatedMap = new Map(
  ALL_CURATED_CATEGORY_CONFIGS.map((item) => [item.slug, item])
);

export function getCuratedCategoryBySlug(
  slug: string
): CuratedCategoryConfig | null {
  return curatedMap.get(slug) || null;
}

export function buildCuratedCategoryQuery(
  config: CuratedCategoryConfig,
  page = 1,
  useFallback = false
): URLSearchParams {
  const params = new URLSearchParams({
    media: config.mediaType,
    include_adult: 'false',
    page: String(Math.max(1, page)),
  });

  const query = useFallback && config.fallbackQuery ? config.fallbackQuery : config.query;
  Object.entries(query).forEach(([key, value]) => {
    if (!value) return;
    params.set(key, value);
  });

  return params;
}
