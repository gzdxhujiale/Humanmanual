'use client';

import { useEffect, useState } from 'react';
import { Editor } from './Editor';

const EditorClient = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <p>Loading...</p>;
  }

  return (
    <>
      <Editor />
    </>
  );
};

export default EditorClient;
