const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

// Listar todos os tamanhos ativos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tamanhos = await prisma.tamanho.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' }
    });

    res.json(tamanhos);
  } catch (erro) {
    console.error('Erro ao listar tamanhos:', erro);
    res.status(500).json({ erro: 'Erro ao listar tamanhos' });
  }
});

// Listar todos os tamanhos (incluindo inativos) - admin
router.get('/todos', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tamanhos = await prisma.tamanho.findMany({
      orderBy: { ordem: 'asc' },
      include: {
        _count: {
          select: { pecas: true }
        }
      }
    });

    res.json(tamanhos);
  } catch (erro) {
    console.error('Erro ao listar todos tamanhos:', erro);
    res.status(500).json({ erro: 'Erro ao listar tamanhos' });
  }
});

// Criar tamanho (admin)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { nome, ordem } = req.body;

    if (!nome) {
      return res.status(400).json({ erro: 'Nome do tamanho é obrigatório' });
    }

    const tamanho = await prisma.tamanho.create({
      data: { 
        nome,
        ordem: ordem || 0
      }
    });

    res.status(201).json(tamanho);
  } catch (erro) {
    console.error('Erro ao criar tamanho:', erro);
    if (erro.code === 'P2002') {
      return res.status(400).json({ erro: 'Tamanho já existe' });
    }
    res.status(500).json({ erro: 'Erro ao criar tamanho' });
  }
});

// Atualizar tamanho (admin)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, ordem, ativo } = req.body;

    const tamanho = await prisma.tamanho.update({
      where: { id: parseInt(id) },
      data: { nome, ordem, ativo }
    });

    res.json(tamanho);
  } catch (erro) {
    console.error('Erro ao atualizar tamanho:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar tamanho' });
  }
});

// Deletar tamanho (admin) - só se não tiver peças
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const pecasCount = await prisma.peca.count({
      where: { tamanhoId: parseInt(id) }
    });

    if (pecasCount > 0) {
      return res.status(400).json({ 
        erro: 'Não é possível deletar tamanho com peças cadastradas. Desative-o ao invés.' 
      });
    }

    await prisma.tamanho.delete({
      where: { id: parseInt(id) }
    });

    res.json({ mensagem: 'Tamanho deletado com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar tamanho:', erro);
    res.status(500).json({ erro: 'Erro ao deletar tamanho' });
  }
});

module.exports = router;
