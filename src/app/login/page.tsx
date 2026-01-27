'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { toast } from 'sonner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error('Erro ao fazer login', {
          description: error.message,
        })
        return
      }

      toast.success('Login realizado com sucesso!')
      router.push('/')
      router.refresh()
    } catch {
      toast.error('Erro inesperado ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Background Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image
          src="/images/login-background.png"
          alt="Financial Doctor"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#20203F]/80 to-[#56138A]/60" />
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-white text-center">
            <h2 className="text-4xl font-bold mb-4">Financial Doctor</h2>
            <p className="text-lg text-white/80">
              Gestão financeira inteligente para sua clínica
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="text-center pb-2 pt-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <Image
                src="/images/logo.png"
                alt="Financial Doctor Logo"
                width={280}
                height={80}
                className="h-auto"
                priority
              />
            </div>
            <CardDescription className="text-base">
              Entre com suas credenciais para acessar o sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12 rounded-xl border-border/50 focus:border-primary transition-colors"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="h-12 rounded-xl border-border/50 focus:border-primary transition-colors"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-brand-gradient hover:opacity-90 transition-opacity text-white font-medium shadow-brand"
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
