"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RegisterFormValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<RegisterFormValues>();

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const onSubmit = async (data: RegisterFormValues) => {
    setError(null);
    setSuccessMessage(null);

    if (data.password !== data.confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSuccessMessage(
      "Registro exitoso. Revisá tu email para confirmar la cuenta.",
    );

    // Opcional: redirigir al login después de unos segundos
    setTimeout(() => {
      router.push("/login");
    }, 2500);
  };

  const password = watch("password");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="mb-6 text-center text-2xl font-semibold text-zinc-900">
          Crear cuenta
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Email corporativo
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
              {...register("password", { required: true, minLength: 6 })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Confirmar contraseña
            </label>
            <input
              type="password"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              {...register("confirmPassword", {
                required: true,
                validate: (value) =>
                  value === password || "Las contraseñas no coinciden.",
              })}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="text-sm text-emerald-600" role="status">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creando cuenta..." : "Registrarme"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-600">
          ¿Ya tenés cuenta?{" "}
          <a
            href="/login"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Iniciar sesión
          </a>
        </p>
      </div>
    </div>
  );
}

