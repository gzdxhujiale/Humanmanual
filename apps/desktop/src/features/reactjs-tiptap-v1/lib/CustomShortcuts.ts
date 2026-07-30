import { Extension } from '@tiptap/core';

export const CustomShortcuts = Extension.create({
  name: 'customShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-1': () => this.editor.commands.toggleHeading({ level: 1 }),
      'Mod-2': () => this.editor.commands.toggleHeading({ level: 2 }),
      'Mod-3': () => this.editor.commands.toggleHeading({ level: 3 }),
      'Mod-4': () => this.editor.commands.toggleHeading({ level: 4 }),
      'Mod-5': () => this.editor.commands.toggleHeading({ level: 5 }),
      'Mod-6': () => this.editor.commands.toggleHeading({ level: 6 }),
      'Mod-0': () => this.editor.commands.setParagraph(),
      'Mod-7': () => this.editor.commands.toggleOrderedList(),
      'Mod-8': () => this.editor.commands.toggleBulletList(),
      'Mod-9': () => this.editor.commands.toggleTaskList(),
    };
  },
});
