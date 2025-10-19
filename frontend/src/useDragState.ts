import { useEffect } from 'react';

/**
 * Hook that sets up global drag state on the document body.
 * This allows drop zones to be visible when any drag operation is happening,
 * even across different windows in the future.
 */
export function useDragState() {
  useEffect(() => {
    let dragCounter = 0; // Track nested drag events

    const handleDragEnter = () => {
      dragCounter++;
      if (dragCounter === 1) {
        document.body.dataset.dragging = 'true';
      }
    };

    const handleDragLeave = () => {
      dragCounter--;
      if (dragCounter === 0) {
        document.body.dataset.dragging = 'false';
      }
    };

    const handleDragEnd = () => {
      dragCounter = 0;
      document.body.dataset.dragging = 'false';
    };

    const handleDrop = () => {
      dragCounter = 0;
      document.body.dataset.dragging = 'false';
    };

    // Add listeners
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('drop', handleDrop);

    // Cleanup
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragend', handleDragEnd);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);
}
