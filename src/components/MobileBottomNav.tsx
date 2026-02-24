/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Film,
  HeartPulse,
  Home,
  PartyPopper,
  Search,
  Tv,
  UserRound,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';
import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

interface MobileBottomNavProps {
  /**
   * Active path override. When omitted, it falls back to usePathname().
   */
  activePath?: string;
  isOpen: boolean;
  onClose: () => void;
}

const MobileBottomNav = ({
  activePath,
  isOpen,
  onClose,
}: MobileBottomNavProps) => {
  const pathname = usePathname();
  const { showMatrixLoading, navigateLinkWithMatrixLoading } =
    useMatrixRouteTransition();

  const currentActive = activePath ?? pathname;

  const [navItems, setNavItems] = useState([
    { icon: Home, label: '\u9996\u9875', href: '/' },
    { icon: Search, label: '\u641c\u7d22', href: '/search' },
    { icon: UserRound, label: '\u6211\u7684', href: '/my' },
    { icon: Film, label: '\u7535\u5f71', href: '/douban?type=movie' },
    { icon: Tv, label: '\u5267\u96c6', href: '/douban?type=tv' },
    { icon: HeartPulse, label: '\u7efc\u827a', href: '/douban?type=show' },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setNavItems((prevItems) => [
        ...prevItems,
        {
          icon: PartyPopper,
          label: '\u81ea\u5b9a\u4e49',
          href: '/douban?type=custom',
        },
      ]);
    }
  }, []);

  useEffect(() => {
    onClose();
  }, [onClose, pathname]);

  const isActive = (href: string) => {
    const typeMatch = href.match(/type=([^&]+)/)?.[1];

    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);

    return (
      decodedActive === decodedItemHref ||
      (decodedActive.startsWith('/douban') &&
        decodedActive.includes(`type=${typeMatch}`))
    );
  };

  return (
    <>
      <MatrixLoadingOverlay visible={showMatrixLoading} />

      {isOpen && (
        <button
          type='button'
          aria-label='\u5173\u95ed\u83dc\u5355'
          onClick={onClose}
          className='md:hidden fixed inset-0 z-[690] bg-black/30'
        />
      )}

      <nav
        className={`md:hidden fixed top-0 left-0 z-[700] h-full w-56 bg-black/95 backdrop-blur-xl border-r border-gray-700/60 shadow-2xl transition-transform duration-300 ease-out dark:bg-black/95 dark:border-gray-700/60 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className='flex justify-center pt-2'>
          <Link
            href='/'
            onClick={(event) =>
              navigateLinkWithMatrixLoading(event, '/', {
                onBeforeNavigate: onClose,
              })
            }
            className='inline-flex items-center justify-center p-1 transition-opacity hover:opacity-85'
            aria-label='\u8fd4\u56de\u9996\u9875'
          >
            <Image src='/logo.png' alt='logo' width={50} height={50} />
          </Link>
        </div>
        <ul className='flex flex-col gap-1 px-3 py-4'>
          {navItems.flatMap((item) => {
            const active = isActive(item.href);
            const navItem = (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={(event) =>
                    navigateLinkWithMatrixLoading(event, item.href, {
                      onBeforeNavigate: onClose,
                    })
                  }
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/5'
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 ${
                      active
                        ? 'text-blue-600 dark:text-blue-300'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            );

            if (item.href === '/my') {
              return [
                navItem,
                <li
                  key='mobile-nav-divider-after-search'
                  className='-mx-2 my-2 border-t border-gray-200/80 dark:border-gray-700/70'
                />,
              ];
            }

            return [navItem];
          })}
        </ul>
      </nav>
    </>
  );
};

export default MobileBottomNav;
