const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

// Listar todos os parceiros (admin)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const parceiros = await prisma.parceiro.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true
          }
        },
        _count: {
          select: {
            pecas: true
          }
        }
      },
      orderBy: {
        criadoEm: 'desc'
      }
    });

    res.json(parceiros);
  } catch (erro) {
    console.error('Erro ao listar parceiros:', erro);
    res.status(500).json({ erro: 'Erro ao listar parceiros' });
  }
});

// Obter dados de um parceiro específico
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Parceiros só podem ver seus próprios dados
    if (req.usuario.tipo === 'parceiro' && req.usuario.parceiroId !== parseInt(id)) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const parceiro = await prisma.parceiro.findUnique({
      where: { id: parseInt(id) },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true
          }
        }
      }
    });

    if (!parceiro) {
      return res.status(404).json({ erro: 'Parceiro não encontrado' });
    }

    res.json(parceiro);
  } catch (erro) {
    console.error('Erro ao obter parceiro:', erro);
    res.status(500).json({ erro: 'Erro ao obter parceiro' });
  }
});

// Criar novo parceiro (admin)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { nome, email, senha, telefone, percentual } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const parceiro = await prisma.parceiro.create({
      data: {
        telefone,
        percentual: percentual || 50.0,
        usuario: {
          create: {
            nome,
            email,
            senha: senhaHash,
            tipo: 'parceiro'
          }
        }
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true
          }
        }
      }
    });

    res.status(201).json(parceiro);
  } catch (erro) {
    console.error('Erro ao criar parceiro:', erro);
    if (erro.code === 'P2002') {
      return res.status(400).json({ erro: 'Email já cadastrado' });
    }
    res.status(500).json({ erro: 'Erro ao criar parceiro' });
  }
});

// Atualizar parceiro (admin)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, telefone, percentual, ativo } = req.body;

    const parceiro = await prisma.parceiro.update({
      where: { id: parseInt(id) },
      data: {
        telefone,
        percentual,
        usuario: {
          update: {
            nome,
            ativo
          }
        }
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true
          }
        }
      }
    });

    res.json(parceiro);
  } catch (erro) {
    console.error('Erro ao atualizar parceiro:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar parceiro' });
  }
});

// Deletar parceiro (admin)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.parceiro.delete({
      where: { id: parseInt(id) }
    });

    res.json({ mensagem: 'Parceiro deletado com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar parceiro:', erro);
    res.status(500).json({ erro: 'Erro ao deletar parceiro' });
  }
});

module.exports = router;
