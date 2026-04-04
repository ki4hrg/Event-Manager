"use client";

import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type RichTextEditorProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
};

export function RichTextEditor({ name, defaultValue = "", placeholder }: RichTextEditorProps) {
  const [html, setHtml] = useState(defaultValue);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: defaultValue,
    onUpdate: ({ editor }) => {
      setHtml(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[100px] w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-b bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
      },
    },
  });

  useEffect(() => {
    if (editor && defaultValue !== editor.getHTML()) {
      editor.commands.setContent(defaultValue || "");
      setHtml(defaultValue || "");
    }
  }, [defaultValue, editor]);

  return (
    <div>
      <div className="flex gap-1 px-2 py-1 border border-gray-300 dark:border-gray-700 border-b-0 rounded-t bg-gray-50 dark:bg-gray-900">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
          className={`px-2 py-0.5 text-sm rounded font-bold ${editor?.isActive("bold") ? "bg-gray-200 dark:bg-gray-700" : "hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
          className={`px-2 py-0.5 text-sm rounded italic ${editor?.isActive("italic") ? "bg-gray-200 dark:bg-gray-700" : "hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
          className={`px-2 py-0.5 text-sm rounded ${editor?.isActive("bulletList") ? "bg-gray-200 dark:bg-gray-700" : "hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        >
          • List
        </button>
      </div>
      {placeholder && editor?.isEmpty && (
        <p className="absolute text-xs text-gray-400 dark:text-gray-500 px-3 py-2 pointer-events-none">{placeholder}</p>
      )}
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
