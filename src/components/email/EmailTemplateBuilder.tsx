import { useState } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Trash2, Edit3 } from 'lucide-react';
import type { EmailLayoutBlock, EmailTemplateLayout } from '../../lib/email-template-service';

interface EmailTemplateBuilderProps {
  layout: EmailTemplateLayout;
  onChange: (layout: EmailTemplateLayout) => void;
  previewMode?: boolean;
}

const BLOCK_TYPES: { type: EmailLayoutBlock['type']; label: string; icon: string }[] = [
  { type: 'header', label: 'Header', icon: '📌' },
  { type: 'hero', label: 'Hero Section', icon: '🎯' },
  { type: 'text', label: 'Text', icon: '📝' },
  { type: 'image', label: 'Image', icon: '🖼️' },
  { type: 'cta', label: 'Button', icon: '🔘' },
  { type: 'divider', label: 'Divider', icon: '─' },
  { type: 'footer', label: 'Footer', icon: '👣' },
];

export function EmailTemplateBuilder({
  layout,
  onChange,
  previewMode = false,
}: EmailTemplateBuilderProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  if (previewMode) {
    return <EmailPreview layout={layout} />;
  }

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    // Adding new block from palette
    if (source.droppableId === 'palette' && destination) {
      const blockType = BLOCK_TYPES[source.index].type;
      const newBlock: EmailLayoutBlock = {
        id: `block-${Date.now()}`,
        type: blockType,
        content: 'Edit this content',
        align: 'left',
      };

      const newBlocks = [...layout.blocks];
      newBlocks.splice(destination.index, 0, newBlock);

      onChange({ ...layout, blocks: newBlocks });
    }
    // Reordering existing blocks
    else if (destination && source.droppableId === 'builder') {
      const newBlocks = Array.from(layout.blocks);
      const [removed] = newBlocks.splice(source.index, 1);
      newBlocks.splice(destination.index, 0, removed);

      onChange({ ...layout, blocks: newBlocks });
    }
  };

  const updateBlock = (id: string, updates: Partial<EmailLayoutBlock>) => {
    const newBlocks = layout.blocks.map(block =>
      block.id === id ? { ...block, ...updates } : block
    );
    onChange({ ...layout, blocks: newBlocks });
  };

  const deleteBlock = (id: string) => {
    const newBlocks = layout.blocks.filter(block => block.id !== id);
    onChange({ ...layout, blocks: newBlocks });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full">
        {/* Palette */}
        <div className="w-48 bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto">
          <h3 className="font-semibold text-sm text-slate-900 mb-4">Email Blocks</h3>
          <Droppable droppableId="palette" type="BLOCK" isDropDisabled>
            {provided => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-2"
              >
                {BLOCK_TYPES.map((blockType, index) => (
                  <Draggable key={blockType.type} draggableId={blockType.type} index={index}>
                    {provided => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="bg-white border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-700 cursor-move hover:bg-slate-50 hover:border-slate-300 transition"
                      >
                        <div>{blockType.icon}</div>
                        <div>{blockType.label}</div>
                      </div>
                    )}
                  </Draggable>
                ))}
              </div>
            )}
          </Droppable>
        </div>

        {/* Builder Canvas */}
        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-6">
          <Droppable droppableId="builder">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`space-y-3 min-h-96 p-4 rounded-lg transition ${
                  snapshot.isDraggingOver ? 'bg-blue-50 border-2 border-blue-300' : 'border-2 border-dashed border-slate-300'
                }`}
              >
                {layout.blocks.length === 0 ? (
                  <div className="flex items-center justify-center h-96 text-slate-400">
                    Drag blocks here to build your email
                  </div>
                ) : (
                  layout.blocks.map((block, index) => (
                    <Draggable key={block.id} draggableId={block.id || `block-${index}`} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`bg-slate-50 border-l-4 border-violet-500 p-4 rounded transition ${
                            snapshot.isDragging ? 'shadow-lg opacity-50' : ''
                          }`}
                        >
                          <BlockEditor
                            block={block}
                            onUpdate={updates => updateBlock(block.id!, updates)}
                            onDelete={() => deleteBlock(block.id!)}
                            isEditing={editingBlockId === block.id}
                            onEditChange={setEditingBlockId}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>

        {/* Preview */}
        <div className="w-80 bg-slate-50 border-l border-slate-200 p-4 overflow-y-auto">
          <h3 className="font-semibold text-sm text-slate-900 mb-4">Email Preview</h3>
          <EmailPreview layout={layout} />
        </div>
      </div>
    </DragDropContext>
  );
}

interface BlockEditorProps {
  block: EmailLayoutBlock;
  onUpdate: (updates: Partial<EmailLayoutBlock>) => void;
  onDelete: () => void;
  isEditing: boolean;
  onEditChange: (id: string | null) => void;
}

function BlockEditor({
  block,
  onUpdate,
  onDelete,
  isEditing,
  onEditChange,
}: BlockEditorProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-slate-700 capitalize">
          {block.type === 'cta' ? 'Button' : block.type}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEditChange(isEditing ? null : block.id!)}
            className="p-1 text-slate-500 hover:text-slate-700"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isEditing ? (
        <BlockForm block={block} onUpdate={onUpdate} onClose={() => onEditChange(null)} />
      ) : (
        <BlockPreview block={block} />
      )}
    </div>
  );
}

function BlockForm({
  block,
  onUpdate,
  onClose,
}: {
  block: EmailLayoutBlock;
  onUpdate: (updates: Partial<EmailLayoutBlock>) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      {(block.type === 'text' || block.type === 'hero') && (
        <>
          {block.type === 'hero' && (
            <>
              <input
                type="text"
                placeholder="Title"
                value={block.title || ''}
                onChange={e => onUpdate({ title: e.target.value })}
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
              <input
                type="text"
                placeholder="Subtitle"
                value={block.subtitle || ''}
                onChange={e => onUpdate({ subtitle: e.target.value })}
                className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
              />
            </>
          )}
          <textarea
            placeholder="Content"
            value={block.content || ''}
            onChange={e => onUpdate({ content: e.target.value })}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
            rows={3}
          />
        </>
      )}

      {block.type === 'image' && (
        <>
          <input
            type="url"
            placeholder="Image URL"
            value={block.imageUrl || ''}
            onChange={e => onUpdate({ imageUrl: e.target.value })}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          />
          <input
            type="text"
            placeholder="Alt text"
            value={block.altText || ''}
            onChange={e => onUpdate({ altText: e.target.value })}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          />
        </>
      )}

      {block.type === 'cta' && (
        <>
          <input
            type="text"
            placeholder="Button Label"
            value={block.buttonLabel || 'Click Here'}
            onChange={e => onUpdate({ buttonLabel: e.target.value })}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          />
          <input
            type="url"
            placeholder="Button URL"
            value={block.buttonUrl || ''}
            onChange={e => onUpdate({ buttonUrl: e.target.value })}
            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
          />
        </>
      )}

      <select
        value={block.align || 'left'}
        onChange={e => onUpdate({ align: e.target.value as any })}
        className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
      >
        <option value="left">Align Left</option>
        <option value="center">Align Center</option>
        <option value="right">Align Right</option>
      </select>

      <button
        onClick={onClose}
        className="w-full px-2 py-1 bg-violet-600 text-white rounded text-xs font-medium hover:bg-violet-700"
      >
        Done
      </button>
    </div>
  );
}

function BlockPreview({ block }: { block: EmailLayoutBlock }) {
  const alignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[block.align || 'left'];

  switch (block.type) {
    case 'header':
      return <div className="text-xs text-slate-500 py-2">Header Block</div>;
    case 'hero':
      return (
        <div className={alignClass}>
          {block.title && <div className="font-bold text-sm text-slate-900">{block.title}</div>}
          {block.subtitle && <div className="text-xs text-slate-600">{block.subtitle}</div>}
        </div>
      );
    case 'text':
      return <div className="text-xs text-slate-600 line-clamp-2">{block.content}</div>;
    case 'image':
      return (
        <div className={alignClass}>
          <div className="text-xs text-slate-400">📷 {block.altText || 'Image'}</div>
        </div>
      );
    case 'cta':
      return (
        <div className={alignClass}>
          <div className="inline-block px-3 py-1 bg-violet-600 text-white rounded text-xs font-medium">
            {block.buttonLabel || 'Click Here'}
          </div>
        </div>
      );
    case 'divider':
      return <div className="border-t border-slate-300 my-2" />;
    case 'footer':
      return <div className="text-xs text-slate-400 py-2">Footer Block</div>;
    default:
      return null;
  }
}

function EmailPreview({ layout }: { layout: EmailTemplateLayout }) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4 space-y-3 text-sm font-sans max-w-xs">
      {layout.blocks.map(block => (
        <BlockPreview key={block.id} block={block} />
      ))}
    </div>
  );
}
