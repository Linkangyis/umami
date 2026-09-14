import { useMessages, useNavigation } from '@/components/hooks';
import { Copy } from '@/components/icons';
import { DialogButton } from '@/components/input/DialogButton';
import type { Board } from '@/lib/types';
import { BoardCloneForm } from './BoardCloneForm';

export function BoardCloneButton({
  boardId,
  showLabel = false,
}: {
  boardId: string;
  showLabel?: boolean;
}) {
  const { router, renderUrl } = useNavigation();
  const { t, labels } = useMessages();

  const handleSave = (board: Board) => {
    router.push(renderUrl(`/boards/${board.id}/design`, false));
  };

  return (
    <DialogButton
      icon={<Copy />}
      label={showLabel ? t(labels.clone) : undefined}
      title={t(labels.cloneBoard)}
      aria-label={t(labels.clone)}
      variant={showLabel ? undefined : 'quiet'}
      width="600px"
    >
      {({ close }) => <BoardCloneForm boardId={boardId} onSave={handleSave} onClose={close} />}
    </DialogButton>
  );
}
