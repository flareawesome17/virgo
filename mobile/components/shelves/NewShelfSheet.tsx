import { Alert } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { NewShelfForm } from '@/components/shelves/NewShelfForm';
import { useShelfActions } from '@/src/hooks';
import { profileActionMessage } from '@/src/lib/profile-media';

/**
 * A new shelf, made from the Taste tab rather than on the way to keeping
 * something. The same form the Keep sheet shows; here there is nothing to go
 * on to, so it closes once the shelf exists.
 */
export function NewShelfSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { createShelf } = useShelfActions();
  const pending = createShelf.isPending;

  return (
    <BottomSheet visible={visible} onClose={() => !pending && onClose()} dismissible={!pending}>
      {/* Mounted per opening, so the field starts empty and takes the keyboard. */}
      {visible ? (
        <NewShelfForm
          onCancel={onClose}
          pending={pending}
          onSubmit={(shelf) =>
            createShelf.mutate(shelf, {
              onSuccess: () => onClose(),
              onError: (error) =>
                Alert.alert("Couldn't add that shelf", profileActionMessage(error, 'shelf')),
            })
          }
        />
      ) : null}
    </BottomSheet>
  );
}
