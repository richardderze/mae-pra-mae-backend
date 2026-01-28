const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (erro) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware };
