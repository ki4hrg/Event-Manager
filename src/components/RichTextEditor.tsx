"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

type RichTextEditorProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
};

export function RichTextEditor({ name, defaultValue = "", placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: defaultValue,
    editorProps: {
      attributes: {
        class:
          "min-h-[100px] w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 prose prose-sm dark:prose-invert max-w-none",
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.commands.setContent(defaultValue || "");
    }
  }, [defaultValue, editor]);

  return (
    <div>
      {placeholder && editor?.isEmpty && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{placeholder}</p>
      )}
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={editor?.getHTML() ?? ""} />
    </div>
  );
}
