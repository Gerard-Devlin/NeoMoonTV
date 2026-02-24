import { ImagePlaceholder } from '@/components/ImagePlaceholder';

const DoubanCardSkeleton = () => {
  return (
    <div className='w-full'>
      <div className='group relative w-full rounded-lg bg-transparent shadow-none flex flex-col'>
        <ImagePlaceholder aspectRatio='aspect-[2/3]' />
        <div className='absolute top-[calc(100%+0.5rem)] left-0 right-0'>
          <div className='flex flex-col items-center justify-center'>
            <div className='mb-2 h-4 w-24 rounded bg-gray-200/80 animate-pulse dark:bg-zinc-800/80 sm:w-32'></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoubanCardSkeleton;
