const ImagePlaceholder = ({ aspectRatio }: { aspectRatio: string }) => (
  <div
    className={`w-full rounded-lg bg-gray-200/80 animate-pulse dark:bg-zinc-800/80 ${aspectRatio}`}
  />
);

export { ImagePlaceholder };
