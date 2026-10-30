import { createContext, useContext } from 'react';

export const ContentModalContext = createContext({ open: () => {}, close: () => {} });
export const useContentModal = () => useContext(ContentModalContext);
