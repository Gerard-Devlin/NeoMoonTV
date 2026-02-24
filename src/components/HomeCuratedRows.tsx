'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import matrixStyles from '@/app/loading.module.css';

import {
  buildCuratedCategoryQuery,
  CuratedCategoryConfig,
  HOME_CURATED_CATEGORY_CONFIGS,
} from '@/lib/curated-categories';

import ScrollableRow from '@/components/ScrollableRow';
import VideoCard from '@/components/VideoCard';

interface CuratedDiscoverItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
}

interface DiscoverApiResponse {
  code: number;
  message: string;
  list: CuratedDiscoverItem[];
}

const LOAD_BATCH_SIZE = 2;
const MATRIX_PATTERN_COUNT = 5;
const MATRIX_COLUMN_COUNT = 40;

interface CuratedRowSectionProps {
  row: CuratedCategoryConfig;
  onNavigateWithMatrixLoading: (
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string
  ) => void;
}

function CuratedRowSection({
  row,
  onNavigateWithMatrixLoading,
}: CuratedRowSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CuratedDiscoverItem[]>([]);
  const [isInView, setIsInView] = useState(false);
  const [hasRevealedItems, setHasRevealedItems] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/tmdb/discover?${buildCuratedCategoryQuery(row, 1).toString()}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as DiscoverApiResponse;
        if (!response.ok || payload.code !== 200) {
          throw new Error(payload.message || 'Failed to fetch curated row');
        }
        setItems(payload.list.slice(0, 12));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [row]);

  useEffect(() => {
    if (isInView) return;

    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setIsInView(true);
        observer.disconnect();
      },
      {
        rootMargin: '0px 0px -14% 0px',
        threshold: 0.12,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInView]);

  useEffect(() => {
    if (!isInView || loading || items.length === 0 || hasRevealedItems) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setHasRevealedItems(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [hasRevealedItems, isInView, items.length, loading]);

  const shouldHide = !loading && items.length === 0;
  if (shouldHide) {
    return null;
  }

  return (
    <section ref={sectionRef} className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-900 dark:text-zinc-100'>
          {row.title}
        </h2>
        <Link
          href={`/curated/${row.slug}`}
          onClick={(event) =>
            onNavigateWithMatrixLoading(event, `/curated/${row.slug}`)
          }
          className='group inline-flex items-center gap-1 rounded-full border border-zinc-300/70 bg-white/70 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition hover:border-sky-300 hover:bg-sky-500/10 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/15 dark:hover:text-sky-300'
        >
          <span>{'\u67e5\u770b\u5168\u90e8'}</span>
          <ChevronRight className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
        </Link>
      </div>

      <ScrollableRow>
        {loading
          ? Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`${row.slug}-skeleton-${index}`}
                className='min-w-[160px] w-40 sm:min-w-[180px] sm:w-44'
              >
                <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200/80 animate-pulse dark:bg-zinc-800/80'></div>
                <div className='mt-2 h-4 rounded bg-gray-200/80 animate-pulse dark:bg-zinc-800/80'></div>
              </div>
            ))
          : items.map((item, index) => (
              <div
                key={`${row.slug}-${item.id}`}
                className={`min-w-[160px] w-40 transform-gpu transition-all duration-500 ease-out will-change-transform motion-reduce:transform-none motion-reduce:transition-none motion-reduce:opacity-100 sm:min-w-[180px] sm:w-44 ${
                  hasRevealedItems ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{
                  transitionDelay: hasRevealedItems ? `${Math.min(index, 11) * 55}ms` : '0ms',
                }}
              >
                <VideoCard
                  from='douban'
                  title={item.title}
                  poster={item.poster}
                  douban_id={item.id}
                  rate={item.rate}
                  year={item.year}
                  type={row.mediaType}
                />
              </div>
            ))}
      </ScrollableRow>
    </section>
  );
}

export default function HomeCuratedRows() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();

  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(LOAD_BATCH_SIZE);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const [showMatrixLoading, setShowMatrixLoading] = useState(false);

  const handleNavigateWithMatrixLoading = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
      if (event.defaultPrevented) return;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const currentFullPath = searchParamString
        ? `${pathname}?${searchParamString}`
        : pathname;
      if (decodeURIComponent(currentFullPath) === decodeURIComponent(href)) {
        return;
      }

      event.preventDefault();
      setShowMatrixLoading(true);

      // Ensure the matrix overlay paints before route change starts.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          router.push(href);
        });
      });
    },
    [pathname, router, searchParamString]
  );

  useEffect(() => {
    if (!showMatrixLoading) return;
    const timer = window.setTimeout(() => {
      setShowMatrixLoading(false);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [showMatrixLoading]);

  useEffect(() => {
    setShowMatrixLoading(false);
  }, [pathname, searchParamString]);

  useEffect(() => {
    if (
      loadingMoreRows ||
      visibleCount >= HOME_CURATED_CATEGORY_CONFIGS.length
    ) {
      return;
    }

    const node = loadMoreTriggerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setLoadingMoreRows(true);
        observer.disconnect();
      },
      {
        rootMargin: '0px 0px 220px 0px',
        threshold: 0,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadingMoreRows, visibleCount]);

  useEffect(() => {
    if (!loadingMoreRows) return;
    const timer = setTimeout(() => {
      setVisibleCount((prev) =>
        Math.min(prev + LOAD_BATCH_SIZE, HOME_CURATED_CATEGORY_CONFIGS.length)
      );
      setLoadingMoreRows(false);
    }, 420);

    return () => clearTimeout(timer);
  }, [loadingMoreRows]);

  const hasMoreRows = visibleCount < HOME_CURATED_CATEGORY_CONFIGS.length;

  return (
    <>
      {showMatrixLoading ? (
        <div className='fixed inset-0 z-[2000]'>
          <div className={matrixStyles['matrix-container']}>
            {Array.from({ length: MATRIX_PATTERN_COUNT }).map((_, patternIndex) => (
              <div key={patternIndex} className={matrixStyles['matrix-pattern']}>
                {Array.from({ length: MATRIX_COLUMN_COUNT }).map(
                  (__unused, columnIndex) => (
                    <div key={columnIndex} className={matrixStyles['matrix-column']} />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className='mb-4'>
        {HOME_CURATED_CATEGORY_CONFIGS.slice(0, visibleCount).map((row) => (
          <CuratedRowSection
            key={row.slug}
            row={row}
            onNavigateWithMatrixLoading={handleNavigateWithMatrixLoading}
          />
        ))}

        {hasMoreRows ? (
          <div
            ref={loadMoreTriggerRef}
            className='flex h-16 items-center justify-center'
          >
            {loadingMoreRows ? (
              <div className='inline-flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400'>
                <span className='h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-sky-500 dark:border-zinc-600 dark:border-t-sky-400' />
                {'\u52a0\u8f7d\u4e2d...'}
              </div>
            ) : (
              <span className='h-5 w-5 rounded-full border border-transparent' />
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
