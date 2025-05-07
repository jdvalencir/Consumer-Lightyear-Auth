// models/User.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db/db.config.js';

export const User = sequelize.define('user', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  documentType: {
    type: DataTypes.STRING,
  },
  documentNumber: {
    type: DataTypes.STRING,
    unique: true,
  },
  name: {
    type: DataTypes.STRING,
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
  },
  phone: {
    type: DataTypes.STRING,
  },
  country: {
    type: DataTypes.STRING,
  },
  department: {
    type: DataTypes.STRING,
  },
  city: {
    type: DataTypes.STRING,
  },
  address: {
    type: DataTypes.STRING,
  },
});
