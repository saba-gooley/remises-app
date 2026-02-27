"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type LoginFormValues = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (data: LoginFormValues) => {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-semibold text-zinc-900">
          Iniciar sesión
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              {...register("email", { required: true })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              {...register("password", { required: true })}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-600">
          ¿No tenés cuenta?{" "}
          <a
            href="/registro"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Registrate
          </a>
        </p>
      </div>
    </div>
  );
}

