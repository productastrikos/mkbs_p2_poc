import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { DataProvider } from './data/DataProvider';
import Layout from './components/layout/Layout';
import { ROUTES, EXTRA_ROUTES } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              {[...ROUTES, ...EXTRA_ROUTES].map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </DataProvider>
    </ThemeProvider>
  );
}
