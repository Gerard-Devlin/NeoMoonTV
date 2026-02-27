'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { BackButton } from './BackButton';
import { UserMenu } from './UserMenu';

interface MobileHeaderProps {
  showBackButton?: boolean;
  isMenuOpen?: boolean;
  onMenuToggle?: () => void;
  isHomePage?: boolean;
}

const MobileHeader = ({
  showBackButton = false,
  isMenuOpen = false,
  onMenuToggle,
  isHomePage = false,
}: MobileHeaderProps) => {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (isMenuOpen) {
      setIsHidden(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    let ticking = false;
    let mainEl: HTMLElement | null = null;

    const getScrollY = () => {
      const windowY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const mainY = mainEl ? mainEl.scrollTop : 0;
      return Math.max(windowY, mainY);
    };

    const update = () => {
      const currentY = getScrollY();
      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (isMenuOpen) {
        setIsHidden(false);
        return;
      }

      if (Math.abs(delta) < 2) return;

      if (currentY < 24) {
        setIsHidden(false);
      } else if (delta > 0) {
        setIsHidden(true);
      } else {
        setIsHidden(false);
      }
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };

    mainEl = document.querySelector('main');
    lastScrollY.current = getScrollY();
    update();

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, {
      passive: true,
      capture: true,
    });
    mainEl?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, true);
      mainEl?.removeEventListener('scroll', handleScroll);
    };
  }, [isMenuOpen]);

  return (
    <header
      className={`md:hidden fixed left-0 right-0 z-[650] transition-all duration-300 ease-out ${
        isHidden
          ? '-translate-y-full opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100'
      }`}
      style={{ top: 0, paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className={`relative mx-auto w-[calc(100%-1.5rem)] max-w-[720px] rounded-3xl backdrop-blur-xl border transition-colors ${
          isHomePage
            ? 'mt-2 bg-white/30 border-white/30 shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:bg-black/35 dark:border-zinc-500/40'
            : 'mt-3 bg-white/70 border-gray-200/60 shadow-sm dark:bg-black/80 dark:border-zinc-700/70'
        }`}
      >
        <div className='relative h-12 flex items-center justify-between px-4'>
          <div className='flex items-center gap-2'>
            {onMenuToggle && (
              <button
                type='button'
                aria-label={isMenuOpen ? '\u5173\u95ed\u83dc\u5355' : '\u6253\u5f00\u83dc\u5355'}
                onClick={onMenuToggle}
                className='p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors dark:text-gray-300 dark:hover:text-white'
              >
                {isMenuOpen ? (
                  <X className='h-5 w-5' />
                ) : (
                  <Menu className='h-5 w-5' />
                )}
              </button>
            )}
            {showBackButton && <BackButton />}
          </div>

          <div className='flex items-center gap-2'>
            <UserMenu />
          </div>
        </div>

        <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
          <Link href='/' className='block hover:opacity-90 transition-opacity'>
            <Image src='/logo.png' alt='logo' width={28} height={28} priority />
          </Link>
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
