// app/auth/signin/__tests__/page.test.tsx
//
// El acceso local aparece SOLO si el servidor lo ofrece de verdad.
//
// Se pregunta por `getProviders()` y no por una variable pública. Una segunda variable que
// dijera «hay acceso local» podría desincronizarse de la que lo habilita: la pantalla
// mostraría un formulario que el servidor rechaza, o lo escondería estando disponible.
// `getProviders()` devuelve lo que NextAuth tiene registrado — no hay dos verdades.

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SignIn from '../page';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

const getProviders = jest.fn();
const signIn = jest.fn();
jest.mock('next-auth/react', () => ({
  getProviders: (...args: unknown[]) => getProviders(...args),
  signIn: (...args: unknown[]) => signIn(...args),
}));

const AZURE = { 'azure-ad': { id: 'azure-ad', name: 'Azure AD' } };
const CON_LOCAL = { ...AZURE, 'acceso-local': { id: 'acceso-local', name: 'Acceso local' } };

beforeEach(() => {
  getProviders.mockReset();
  signIn.mockReset();
});

describe('pantalla de inicio de sesión', () => {
  it('siempre ofrece el Directorio', async () => {
    getProviders.mockResolvedValue(AZURE);
    render(<SignIn />);

    await waitFor(() => expect(getProviders).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

    expect(signIn).toHaveBeenCalledWith('azure-ad', { callbackUrl: '/mi-sig' });
  });

  it('sin acceso local, no hay formulario que ofrecer', async () => {
    getProviders.mockResolvedValue(AZURE);
    render(<SignIn />);

    await waitFor(() => expect(getProviders).toHaveBeenCalled());

    expect(screen.queryByLabelText(/Correo/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entrar sin Directorio/ })).not.toBeInTheDocument();
  });

  it('con acceso local, pide correo y grupos', async () => {
    getProviders.mockResolvedValue(CON_LOCAL);
    render(<SignIn />);

    expect(await screen.findByLabelText(/Correo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Grupos/)).toBeInTheDocument();
  });

  it('entra con los grupos escritos, que es de donde salen los permisos', async () => {
    getProviders.mockResolvedValue(CON_LOCAL);
    render(<SignIn />);

    fireEvent.change(await screen.findByLabelText(/Correo/), {
      target: { value: 'jhon.tamayo@cuantico.com' },
    });
    fireEvent.change(screen.getByLabelText(/Grupos/), { target: { value: 'Líderes SIG' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar sin Directorio/ }));

    expect(signIn).toHaveBeenCalledWith('acceso-local', {
      correo: 'jhon.tamayo@cuantico.com',
      grupos: 'Líderes SIG',
      callbackUrl: '/mi-sig',
    });
  });

  it('deja entrar sin grupos: ese es el camino del Colaborador', async () => {
    getProviders.mockResolvedValue(CON_LOCAL);
    render(<SignIn />);

    fireEvent.change(await screen.findByLabelText(/Correo/), {
      target: { value: 'alguien@cuantico.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Entrar sin Directorio/ }));

    expect(signIn).toHaveBeenCalledWith('acceso-local', {
      correo: 'alguien@cuantico.com',
      grupos: '',
      callbackUrl: '/mi-sig',
    });
  });

  it('sin correo no hace nada: no hay a quién identificar', async () => {
    getProviders.mockResolvedValue(CON_LOCAL);
    render(<SignIn />);

    await screen.findByLabelText(/Correo/);
    fireEvent.click(screen.getByRole('button', { name: /Entrar sin Directorio/ }));

    expect(signIn).not.toHaveBeenCalled();
  });
});
