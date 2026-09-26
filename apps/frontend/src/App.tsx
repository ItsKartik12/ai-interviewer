import "./index.css";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { ProfileSetup } from "./components/ProfileSetup";
import { Profile } from "./components/Profile";
import { History } from "./components/History";
import { Login } from "./auth/Login";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth, RedirectIfAuthed } from "./auth/guards";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { ThemeProvider, useTheme } from "./lib/theme";

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="bottom-left" theme={theme} />;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <Login />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Form />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/setup"
            element={
              <RequireAuth>
                <ProfileSetup />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireAuth>
                <History />
              </RequireAuth>
            }
          />
          <Route
            path="/interview/:interviewId"
            element={
              <RequireAuth>
                <Interview />
              </RequireAuth>
            }
          />
          <Route
            path="/result/:interviewId"
            element={
              <RequireAuth>
                <Result />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ThemedToaster />
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
