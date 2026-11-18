import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Layout, { Spinner } from "./components/Layout";
import { RealtimeProvider } from "./realtime";
import { ToastProvider } from "./toast";
import Consumption from "./pages/Consumption";
import Login from "./pages/Login";
import Occupancy from "./pages/Occupancy";
import Orders from "./pages/Orders";
import Reservations from "./pages/Reservations";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  // O RealtimeProvider fica acima de todas as páginas: o alerta sonoro
  // funciona em qualquer tela do painel, não só na de Pedidos.
  return (
    <RealtimeProvider>
      <Layout />
    </RealtimeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected />}>
              <Route index element={<Occupancy />} />
              <Route path="pedidos" element={<Orders />} />
              <Route path="consumo" element={<Consumption />} />
              <Route path="reservas" element={<Reservations />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
