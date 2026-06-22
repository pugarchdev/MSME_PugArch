/**
 * Client-side image compression utility to make uploads instant.
 * Dynamically resizes and compresses large images before transmission.
 */
export const compressImage = (
  file: File,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.75
): Promise<File> => {
  return new Promise((resolve) => {
    // Only compress common image formats (jpg, png, webp)
    if (!file.type.startsWith('image/') || file.type.includes('gif') || file.type.includes('svg')) {
      return resolve(file);
    }

    // Skip compression for already-manageable images. Canvas conversion is
    // expensive on the main thread and can feel slower than uploading the file.
    if (file.size < 1024 * 1024) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);

        // Draw image on canvas to scale it
        ctx.drawImage(img, 0, 0, width, height);

        // Export canvas as compressed JPEG blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // If compression didn't actually save space, use the original file!
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }

            // Convert blob back into a named File
            const extension = '.jpg';
            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            const compressedFileName = `${baseName}_optimized${extension}`;
            
            const compressedFile = new File([blob], compressedFileName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });

            console.log(
              `[Compression] Finished: ${file.name} (${(file.size / 1024).toFixed(1)} KB) -> ${compressedFileName} (${(compressedFile.size / 1024).toFixed(1)} KB) | Reduction: ${Math.round((1 - compressedFile.size / file.size) * 100)}%`
            );
            
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};
