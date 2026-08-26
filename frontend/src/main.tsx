import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { initMonitoring, captureError } from "./lib/monitoring";
import "./styles/globals.css";
import "./i18n";

// Before the first render, so an error thrown while mounting is still caught.
initMonitoring();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
  // Every query and mutation failure passes through here. The reporter drops
  // the expected ones (rejected orders, offline, 401) and keeps the rest, so
  // a bug in a background refetch is no longer invisible just because nothing
  // rendered an error for it.
  queryCache: new QueryCache({
    onError: (error, query) => captureError(error, { queryKey: query.queryKey }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => captureError(error, { mutation: mutation.options.mutationKey }),
  }),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
