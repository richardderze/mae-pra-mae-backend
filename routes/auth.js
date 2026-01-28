const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: {
        parceiro: true
      }
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { 
        id: usuario.id, 
        email: usuario.email, 
        tipo: usuario.tipo,
        parceiroId: usuario.parceiro?.id 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo,
        parceiroId: usuario.parceiro?.id
      }
    });
  } catch (erro) {
    console.error('Erro no login:', erro);
    res.status(500).json({ erro: 'Erro ao fazer login' });
  }
});

// Criar primeiro usuário admin (apenas para setup inicial)
router.post('/setup-admin', async (req, res) => {
  try {
    const adminExiste = await prisma.usuario.findFirst({
      where: { tipo: 'admin' }
    });

    if (adminExiste) {
      return res.status(400).json({ erro: 'Admin já existe' });
    }

    const { nome, email, senha } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);

    const admin = await prisma.usuario.create({
      data: {
        nome,
        email,
        senha: senhaHash,
        tipo: 'admin'
      }
    });

    res.json({ mensagem: 'Admin criado com sucesso', admin: { id: admin.id, nome: admin.nome, email: admin.email } });
  } catch (erro) {
    console.error('Erro ao criar admin:', erro);
    res.status(500).json({ erro: 'Erro ao criar admin' });
  }
});

module.exports = router;
