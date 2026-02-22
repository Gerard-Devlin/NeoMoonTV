'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { processImageUrl } from '@/lib/utils';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

export const runtime = 'edge';

interface PersonCredit {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;
  role: string;
  department?: string;
  score: string;
  overview: string;
  popularity: number;
}

interface PersonDetail {
  id: number;
  name: string;
  profile: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  knownForDepartment: string;
  biography: string;
  popularity: number;
  homepage: string;
  imdbId: string;
  credits: PersonCredit[];
}

interface CreditRailSection {
  key: string;
  title: string;
  items: PersonCredit[];
  showAllHref?: string;
}

const PRODUCER_ROLE_RE =
  /\b(executive producer|co-producer|associate producer|line producer|producer)\b|制片|监制|出品/i;
const DIRECTOR_ROLE_RE = /\b(series director|director)\b|导演/i;
const DIRECTOR_EXCLUDE_RE =
  /\b(art|photography|assistant|casting|music|voice|visual|stunt|production|unit)\s+director\b/i;

function normalizeRole(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function toCreditTimestamp(releaseDate?: string, year?: string): number {
  const normalizedDate = (releaseDate || '').trim();
  if (normalizedDate) {
    const timestamp = Date.parse(normalizedDate);
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  const normalizedYear = (year || '').trim();
  if (/^\d{4}$/.test(normalizedYear)) {
    return Date.UTC(Number(normalizedYear), 0, 1);
  }

  return 0;
}

function sortCredits(items: PersonCredit[]): PersonCredit[] {
  return [...items].sort((a, b) => {
    const dateDiff =
      toCreditTimestamp(b.releaseDate, b.year) -
      toCreditTimestamp(a.releaseDate, a.year);
    if (dateDiff !== 0) return dateDiff;
    const popularityDiff = b.popularity - a.popularity;
    if (popularityDiff !== 0) return popularityDiff;
    return b.id - a.id;
  });
}

function dedupeCreditsByMedia(items: PersonCredit[]): PersonCredit[] {
  const deduped = new Map<string, PersonCredit>();

  for (const item of items) {
    const key = `${item.mediaType}-${item.id}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }

    const itemDate = toCreditTimestamp(item.releaseDate, item.year);
    const existingDate = toCreditTimestamp(existing.releaseDate, existing.year);
    if (itemDate > existingDate) {
      deduped.set(key, item);
      continue;
    }
    if (itemDate === existingDate && item.popularity > existing.popularity) {
      deduped.set(key, item);
    }
  }

  return sortCredits(Array.from(deduped.values()));
}

function isProducerCredit(item: PersonCredit): boolean {
  const role = normalizeRole(item.role);
  const department = normalizeRole(item.department);
  return PRODUCER_ROLE_RE.test(role) || /production|制片|制作/.test(department);
}

function isDirectorCredit(item: PersonCredit): boolean {
  const role = normalizeRole(item.role);
  const department = normalizeRole(item.department);

  if (role.includes('导演')) return true;
  if (DIRECTOR_EXCLUDE_RE.test(role)) return false;
  if (DIRECTOR_ROLE_RE.test(role)) return true;

  return /directing|导演/.test(department);
}

function CreditRail({ title, items, showAllHref }: CreditRailSection) {
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [desktopHovered, setDesktopHovered] = useState(false);

  const checkDesktopScroll = useCallback(() => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const { scrollWidth, clientWidth, scrollLeft } = node;
    const threshold = 1;
    setShowRightScroll(scrollWidth - (scrollLeft + clientWidth) > threshold);
    setShowLeftScroll(scrollLeft > threshold);
  }, []);

  useEffect(() => {
    checkDesktopScroll();
    window.addEventListener('resize', checkDesktopScroll);
    return () => {
      window.removeEventListener('resize', checkDesktopScroll);
    };
  }, [checkDesktopScroll, items]);

  const scrollDesktopBy = useCallback((direction: 'left' | 'right') => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const amount = Math.max(node.clientWidth * 0.9, 380);
    node.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth',
    });
  }, []);

  return (
    <section className='mb-11 sm:mb-14'>
      <div className='mb-3 flex items-center gap-1'>
        <h2 className='text-[1.05rem] font-semibold leading-none tracking-tight text-white sm:text-[1.2rem]'>
          {title}
        </h2>
        {showAllHref ? (
          <Link
            href={showAllHref}
            className='inline-flex items-center text-zinc-300 transition-colors hover:text-white'
            aria-label={`查看${title}全部`}
          >
            <ChevronRight className='h-4 w-4 sm:h-5 sm:w-5' />
          </Link>
        ) : (
          <ChevronRight className='h-4 w-4 text-zinc-500 sm:h-5 sm:w-5' />
        )}
      </div>

      <div
        className='relative hidden md:block'
        onMouseEnter={() => {
          setDesktopHovered(true);
          checkDesktopScroll();
        }}
        onMouseLeave={() => setDesktopHovered(false)}
      >
        <div
          ref={desktopScrollRef}
          className='-mx-1 overflow-x-auto pb-1 scrollbar-hide'
          onScroll={checkDesktopScroll}
        >
          <div className='flex min-w-max gap-3 px-1 sm:gap-4'>
            {items.map((item, index) => (
              <div
                key={`${title}-${item.mediaType}-${item.id}-${item.role || 'role'}-${index}`}
                className='w-[145px] flex-shrink-0 sm:w-[170px] md:w-[190px] lg:w-[210px]'
              >
                <VideoCard
                  id={String(item.id)}
                  title={item.title}
                  poster={item.poster}
                  year={item.year}
                  rate={item.score}
                  douban_id={String(item.id)}
                  from='douban'
                  type={item.mediaType}
                />
              </div>
            ))}
          </div>
        </div>

        {showLeftScroll ? (
          <div
            className={`absolute left-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
              desktopHovered ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: 'transparent', pointerEvents: 'none' }}
          >
            <div
              className='absolute inset-0 flex items-center justify-center'
              style={{
                top: '40%',
                bottom: '60%',
                left: '-4.5rem',
                pointerEvents: 'auto',
              }}
            >
              <button
                type='button'
                onClick={() => scrollDesktopBy('left')}
                className='flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-lg transition-transform hover:scale-105 hover:bg-white dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700'
                aria-label='向左滚动'
              >
                <ChevronLeft className='h-6 w-6 text-gray-600 dark:text-gray-300' />
              </button>
            </div>
          </div>
        ) : null}

        {showRightScroll ? (
          <div
            className={`absolute right-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
              desktopHovered ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: 'transparent', pointerEvents: 'none' }}
          >
            <div
              className='absolute inset-0 flex items-center justify-center'
              style={{
                top: '40%',
                bottom: '60%',
                right: '-4.5rem',
                pointerEvents: 'auto',
              }}
            >
              <button
                type='button'
                onClick={() => scrollDesktopBy('right')}
                className='flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-lg transition-transform hover:scale-105 hover:bg-white dark:border-gray-600 dark:bg-gray-800/90 dark:hover:bg-gray-700'
                aria-label='向右滚动'
              >
                <ChevronRight className='h-6 w-6 text-gray-600 dark:text-gray-300' />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className='overflow-x-auto pb-1 scrollbar-hide md:hidden'>
        <div className='flex min-w-max gap-3 sm:gap-4'>
          {items.map((item, index) => (
            <div
              key={`${title}-mobile-${item.mediaType}-${item.id}-${item.role || 'role'}-${index}`}
              className='w-[145px] flex-shrink-0 sm:w-[170px]'
            >
              <VideoCard
                id={String(item.id)}
                title={item.title}
                poster={item.poster}
                year={item.year}
                rate={item.score}
                douban_id={String(item.id)}
                from='douban'
                type={item.mediaType}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RailSkeleton({ title }: { title: string }) {
  return (
    <section className='mb-11 sm:mb-14'>
      <div className='mb-3 flex items-center gap-1'>
        <h2 className='text-[1.05rem] font-semibold leading-none tracking-tight text-zinc-500 sm:text-[1.2rem]'>
          {title}
        </h2>
        <ChevronRight className='h-4 w-4 text-zinc-600 sm:h-5 sm:w-5' />
      </div>
      <div className='overflow-x-auto pb-1 scrollbar-hide'>
        <div className='flex min-w-max gap-3 sm:gap-4'>
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={`${title}-skeleton-${index}`}
              className='h-[218px] w-[145px] flex-shrink-0 animate-pulse rounded-[20px] bg-zinc-800 sm:h-[255px] sm:w-[170px] md:h-[285px] md:w-[190px] lg:h-[315px] lg:w-[210px]'
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);

  useEffect(() => {
    const idNum = Number(personId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setError('Invalid person id');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/tmdb/person/${idNum}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as PersonDetail & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load person detail');
        }

        setDetail(payload);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError((err as Error).message || 'Failed to load person detail');
      } finally {
        setLoading(false);
      }
    };

    void run();

    return () => controller.abort();
  }, [personId]);

  const movieCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(
      detail.credits.filter((item) => item.mediaType === 'movie')
    );
  }, [detail]);

  const showCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(
      detail.credits.filter((item) => item.mediaType === 'tv')
    );
  }, [detail]);

  const producerCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(detail.credits.filter(isProducerCredit));
  }, [detail]);

  const directorCredits = useMemo(() => {
    if (!detail?.credits?.length) return [];
    return dedupeCreditsByMedia(detail.credits.filter(isDirectorCredit));
  }, [detail]);

  const selectedSection = useMemo(() => {
    const section = (searchParams.get('section') || '').trim().toLowerCase();
    if (section === 'movie' || section === 'tv') return section;
    return '';
  }, [searchParams]);

  const rails = useMemo<CreditRailSection[]>(() => {
    const list: CreditRailSection[] = [];
    if (movieCredits.length > 0) {
      list.push({
        key: 'movies',
        title: '电影',
        items: movieCredits,
        showAllHref: detail ? `/person/${detail.id}?section=movie` : undefined,
      });
    }
    if (showCredits.length > 0) {
      list.push({
        key: 'shows',
        title: '剧集',
        items: showCredits,
        showAllHref: detail ? `/person/${detail.id}?section=tv` : undefined,
      });
    }
    if (producerCredits.length > 0) {
      list.push({ key: 'producer', title: '制片', items: producerCredits });
    }
    if (directorCredits.length > 0) {
      list.push({ key: 'director', title: '导演', items: directorCredits });
    }

    if (!list.length && detail?.credits?.length) {
      list.push({
        key: 'works',
        title: '作品',
        items: dedupeCreditsByMedia(detail.credits),
      });
    }

    return list;
  }, [detail, directorCredits, movieCredits, producerCredits, showCredits]);

  const selectedSectionData = useMemo(() => {
    if (selectedSection === 'movie') {
      return {
        title: '电影',
        items: movieCredits,
      };
    }
    if (selectedSection === 'tv') {
      return {
        title: '剧集',
        items: showCredits,
      };
    }
    return null;
  }, [movieCredits, selectedSection, showCredits]);

  return (
    <PageLayout activePath='/search' forceShowBackButton>
      <div className='min-h-screen w-full bg-black text-white'>
        <div className='mx-auto w-full max-w-[1900px] px-3 pb-8 pt-4 sm:px-8 sm:pb-12 sm:pt-6 md:px-10 md:pt-8'>
          {loading ? (
            <div className='space-y-2'>
              <div className='mb-8 sm:mb-10'>
                <div className='mx-auto h-9 w-48 animate-pulse rounded-full bg-zinc-700/80 sm:h-10 sm:w-56' />
              </div>

              <RailSkeleton title='电影' />
              <RailSkeleton title='剧集' />
              <RailSkeleton title='制片' />
            </div>
          ) : error ? (
            <div className='rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-100'>
              {error}
            </div>
          ) : detail ? (
            <>
              <header className='mb-8 sm:mb-10'>
                <div className='flex items-center justify-center gap-2'>
                  <span className='relative inline-flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-zinc-800 text-xs font-medium text-zinc-200 sm:h-9 sm:w-9 sm:text-sm'>
                    {detail.profile ? (
                      <Image
                        src={processImageUrl(detail.profile)}
                        alt={detail.name}
                        fill
                        className='object-cover'
                        sizes='36px'
                        unoptimized
                      />
                    ) : (
                      detail.name.trim().slice(0, 1).toUpperCase() || '人'
                    )}
                  </span>
                  <h1 className='text-center text-[1rem] font-normal leading-none tracking-tight text-white sm:text-[1.12rem]'>
                    {detail.name}
                  </h1>
                </div>
              </header>

              {selectedSectionData ? (
                <section>
                  <div className='mb-5 flex items-center gap-2'>
                    <Link
                      href={`/person/${detail.id}`}
                      className='text-sm text-zinc-400 transition-colors hover:text-white'
                    >
                      返回
                    </Link>
                    <span className='text-zinc-600'>/</span>
                    <h2 className='text-[1.05rem] font-semibold text-white sm:text-[1.2rem]'>
                      {selectedSectionData.title}全部
                    </h2>
                    <span className='text-xs text-zinc-400'>
                      共 {selectedSectionData.items.length} 部
                    </span>
                  </div>

                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {selectedSectionData.items.map((item, index) => (
                      <div
                        key={`${selectedSectionData.title}-all-${item.mediaType}-${item.id}-${index}`}
                      >
                        <VideoCard
                          id={String(item.id)}
                          title={item.title}
                          poster={item.poster}
                          year={item.year}
                          rate={item.score}
                          douban_id={String(item.id)}
                          from='douban'
                          type={item.mediaType}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ) : rails.length > 0 ? (
                rails.map((section) => (
                  <CreditRail
                    key={section.key}
                    title={section.title}
                    items={section.items}
                    showAllHref={section.showAllHref}
                  />
                ))
              ) : (
                <div className='rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-zinc-300'>
                  暂无作品信息。
                </div>
              )}
            </>
          ) : (
            <div className='rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-zinc-300'>
              未找到该演员信息。
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
