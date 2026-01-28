const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const prisma = new PrismaClient();

// Listar vendas
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { parceiroId, pago } = req.query;
    
    const where = {};
    
    if (pago !== undefined) {
      where.pagamento = {
        pago: pago === 'true'
      };
    }

    const vendas = await prisma.venda.findMany({
      where,
      include: {
        peca: {
          include: {
            parceiro: {
              include: {
                usuario: {
                  select: { nome: true }
                }
              }
            },
            marca: true,
            tamanho: true
          }
        },
        pagamento: true
      },
      orderBy: {
        dataVenda: 'desc'
      }
    });

    // Filtrar por parceiro se necessário
    let vendasFiltradas = vendas;
    if (req.usuario.tipo === 'parceiro') {
      vendasFiltradas = vendas.filter(v => v.peca.parceiroId === req.usuario.parceiroId);
    } else if (parceiroId) {
      vendasFiltradas = vendas.filter(v => v.peca.parceiroId === parseInt(parceiroId));
    }

    res.json(vendasFiltradas);
  } catch (erro) {
    console.error('Erro ao listar vendas:', erro);
    res.status(500).json({ erro: 'Erro ao listar vendas' });
  }
});

// Registrar venda única
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { pecaId, valorVendido } = req.body;

    if (!pecaId || !valorVendido) {
      return res.status(400).json({ erro: 'Peça e valor são obrigatórios' });
    }

    // Buscar a peça
    const peca = await prisma.peca.findUnique({
      where: { id: parseInt(pecaId) },
      include: {
        parceiro: true
      }
    });

    if (!peca) {
      return res.status(404).json({ erro: 'Peça não encontrada' });
    }

    if (peca.status === 'vendida') {
      return res.status(400).json({ erro: 'Peça já foi vendida' });
    }

    // Criar venda e pagamento em uma transação
    const resultado = await prisma.$transaction(async (tx) => {
      // Criar venda
      const venda = await tx.venda.create({
        data: {
          pecaId: parseInt(pecaId),
          valorVendido: parseFloat(valorVendido)
        }
      });

      // Calcular valor do parceiro
      const valorParceiro = (parseFloat(valorVendido) * peca.parceiro.percentual) / 100;

      // Criar pagamento
      const pagamento = await tx.pagamento.create({
        data: {
          vendaId: venda.id,
          parceiroId: peca.parceiroId,
          valorParceiro,
          percentual: peca.parceiro.percentual,
          pago: false
        }
      });

      // Atualizar status da peça
      await tx.peca.update({
        where: { id: parseInt(pecaId) },
        data: { status: 'vendida' }
      });

      return { venda, pagamento };
    });

    res.status(201).json(resultado);
  } catch (erro) {
    console.error('Erro ao registrar venda:', erro);
    res.status(500).json({ erro: 'Erro ao registrar venda' });
  }
});

// Baixa em massa de vendas
router.post('/massa', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { vendas } = req.body; // Array de { pecaId, valorVendido }

    if (!vendas || !Array.isArray(vendas) || vendas.length === 0) {
      return res.status(400).json({ erro: 'Lista de vendas inválida' });
    }

    const resultados = await prisma.$transaction(async (tx) => {
      const vendasCriadas = [];
      const erros = [];

      for (const vendaData of vendas) {
        try {
          const { pecaId, valorVendido } = vendaData;

          // Buscar a peça
          const peca = await tx.peca.findUnique({
            where: { id: parseInt(pecaId) },
            include: { parceiro: true }
          });

          if (!peca) {
            erros.push({ pecaId, erro: 'Peça não encontrada' });
            continue;
          }

          if (peca.status === 'vendida') {
            erros.push({ pecaId, erro: 'Peça já foi vendida' });
            continue;
          }

          // Criar venda
          const venda = await tx.venda.create({
            data: {
              pecaId: parseInt(pecaId),
              valorVendido: parseFloat(valorVendido)
            }
          });

          // Calcular valor do parceiro
          const valorParceiro = (parseFloat(valorVendido) * peca.parceiro.percentual) / 100;

          // Criar pagamento
          await tx.pagamento.create({
            data: {
              vendaId: venda.id,
              parceiroId: peca.parceiroId,
              valorParceiro,
              percentual: peca.parceiro.percentual,
              pago: false
            }
          });

          // Atualizar status da peça
          await tx.peca.update({
            where: { id: parseInt(pecaId) },
            data: { status: 'vendida' }
          });

          vendasCriadas.push(venda);
        } catch (erro) {
          erros.push({ pecaId: vendaData.pecaId, erro: erro.message });
        }
      }

      return { vendasCriadas, erros };
    });

    res.json({
      sucesso: resultados.vendasCriadas.length,
      erros: resultados.erros.length,
      detalhes: resultados
    });
  } catch (erro) {
    console.error('Erro ao processar vendas em massa:', erro);
    res.status(500).json({ erro: 'Erro ao processar vendas em massa' });
  }
});

// Deletar venda (admin) - reverter venda
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await prisma.$transaction(async (tx) => {
      const venda = await tx.venda.findUnique({
        where: { id: parseInt(id) },
        include: { pagamento: true }
      });

      if (!venda) {
        throw new Error('Venda não encontrada');
      }

      if (venda.pagamento && venda.pagamento.pago) {
        throw new Error('Não é possível deletar venda com pagamento já realizado');
      }

      // Deletar pagamento
      if (venda.pagamento) {
        await tx.pagamento.delete({
          where: { vendaId: parseInt(id) }
        });
      }

      // Deletar venda
      await tx.venda.delete({
        where: { id: parseInt(id) }
      });

      // Retornar peça para disponível
      await tx.peca.update({
        where: { id: venda.pecaId },
        data: { status: 'disponivel' }
      });

      return venda;
    });

    res.json({ mensagem: 'Venda revertida com sucesso' });
  } catch (erro) {
    console.error('Erro ao deletar venda:', erro);
    res.status(400).json({ erro: erro.message || 'Erro ao deletar venda' });
  }
});

module.exports = router;
