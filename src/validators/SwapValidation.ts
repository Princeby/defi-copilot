// src/validators/SwapValidation.ts
import { body, query, param, ValidationChain } from 'express-validator'
import { isAddress } from 'ethers'

// Define interfaces for better type safety
interface SwapQuery {
  srcToken?: string;
  dstToken?: string;
  direction?: 'EthereumToPolkadot' | 'PolkadotToEthereum';
  amount?: string;
  slippageTolerance?: string;
}

interface SwapBody {
  srcToken?: string;
  dstToken?: string;
  direction?: 'EthereumToPolkadot' | 'PolkadotToEthereum';
  srcAmount?: string;
  dstAmount?: string;
  walletAddress?: string;
  deadline?: string;
  slippageTolerance?: string;
}

export class SwapValidation {
  
  static validateCreateSwap(): ValidationChain[] {
    return [
      body('direction')
        .isIn(['EthereumToPolkadot', 'PolkadotToEthereum'])
        .withMessage('Direction must be either EthereumToPolkadot or PolkadotToEthereum'),
      
      body('srcToken')
        .notEmpty()
        .withMessage('Source token is required')
        .isString()
        .withMessage('Source token must be a string')
        .isLength({ min: 1, max: 42 })
        .withMessage('Source token must be between 1 and 42 characters'),
      
      body('dstToken')
        .notEmpty()
        .withMessage('Destination token is required')
        .isString()
        .withMessage('Destination token must be a string')
        .isLength({ min: 1, max: 42 })
        .withMessage('Destination token must be between 1 and 42 characters'),
      
      body('srcAmount')
        .notEmpty()
        .withMessage('Source amount is required')
        .isNumeric()
        .withMessage('Source amount must be numeric')
        .isFloat({ min: 0.000001 })
        .withMessage('Source amount must be greater than 0.000001')
        .isFloat({ max: 1000000 })
        .withMessage('Source amount cannot exceed 1,000,000'),
      
      body('dstAmount')
        .notEmpty()
        .withMessage('Destination amount is required')
        .isNumeric()
        .withMessage('Destination amount must be numeric')
        .isFloat({ min: 0.000001 })
        .withMessage('Destination amount must be greater than 0.000001')
        .isFloat({ max: 1000000 })
        .withMessage('Destination amount cannot exceed 1,000,000'),
      
      body('walletAddress')
        .notEmpty()
        .withMessage('Wallet address is required')
        .custom((value, { req }) => {
          const { direction } = req.body as SwapBody
          
          if (direction === 'EthereumToPolkadot' && !isAddress(value)) {
            throw new Error('Invalid Ethereum wallet address')
          }
          
          if (direction === 'PolkadotToEthereum') {
            if ((!value.startsWith('1') && !value.startsWith('5') && !value.startsWith('15')) ||
                value.length < 47 || value.length > 48) {
              throw new Error('Invalid Polkadot wallet address')
            }
          }
          
          return true
        }),
      
      body('deadline')
        .optional()
        .isInt({ min: 300, max: 86400 })
        .withMessage('Deadline must be between 300 seconds (5 minutes) and 86400 seconds (24 hours)'),
      
      body('slippageTolerance')
        .optional()
        .isFloat({ min: 0.1, max: 10 })
        .withMessage('Slippage tolerance must be between 0.1% and 10%'),

      SwapValidation.validateTokenAddress(),
      SwapValidation.validateSwapAmount(),
      SwapValidation.validateDeadline()
    ]
  }

  static validateGetQuote(): ValidationChain[] {
    return [
      query('direction')
        .isIn(['EthereumToPolkadot', 'PolkadotToEthereum'])
        .withMessage('Direction must be either EthereumToPolkadot or PolkadotToEthereum'),
      
      query('srcToken')
        .notEmpty()
        .withMessage('Source token is required')
        .isString()
        .withMessage('Source token must be a string')
        .isLength({ min: 1, max: 42 })
        .withMessage('Source token must be between 1 and 42 characters'),
      
      query('dstToken')
        .notEmpty()
        .withMessage('Destination token is required')
        .isString()
        .withMessage('Destination token must be a string')
        .isLength({ min: 1, max: 42 })
        .withMessage('Destination token must be between 1 and 42 characters'),
      
      query('amount')
        .notEmpty()
        .withMessage('Amount is required')
        .isNumeric()
        .withMessage('Amount must be numeric')
        .isFloat({ min: 0.000001 })
        .withMessage('Amount must be greater than 0.000001')
        .isFloat({ max: 1000000 })
        .withMessage('Amount cannot exceed 1,000,000'),
      
      query('slippageTolerance')
        .optional()
        .isFloat({ min: 0.1, max: 10 })
        .withMessage('Slippage tolerance must be between 0.1% and 10%'),

      query().custom((value, { req }) => {
        // FIX APPLIED HERE:
        // Use `|| {}` to provide a default empty object. This prevents the error
        // when trying to destructure properties from a potentially undefined `req.query`.
        const { srcToken, dstToken, direction } = (req.query || {}) as SwapQuery;
        
        if (!direction || !srcToken || !dstToken) {
          throw new Error('Missing required query parameters: direction, srcToken, dstToken')
        }
        
        if (direction === 'EthereumToPolkadot') {
          if (srcToken !== 'ETH' && !isAddress(srcToken)) {
            throw new Error('Invalid Ethereum source token address')
          }
        }
        
        if (direction === 'PolkadotToEthereum') {
          if (dstToken !== 'ETH' && !isAddress(dstToken)) {
            throw new Error('Invalid Ethereum destination token address')
          }
        }
        
        return true
      })
    ]
  }

  static validateExecuteSwap(): ValidationChain[] {
    return [
      param('orderHash')
        .isLength({ min: 64, max: 66 })
        .withMessage('Invalid order hash format')
        .matches(/^0x[a-fA-F0-9]{64}$/)
        .withMessage('Order hash must be a valid hex string'),

      body('signature')
        .optional()
        .isString()
        .withMessage('Signature must be a string')
        .matches(/^0x[a-fA-F0-9]{130}$/)
        .withMessage('Invalid signature format'),
      
      body('gasLimit')
        .optional()
        .isInt({ min: 21000, max: 10000000 })
        .withMessage('Gas limit must be between 21,000 and 10,000,000'),
      
      body('maxFeePerGas')
        .optional()
        .isNumeric()
        .withMessage('Max fee per gas must be numeric')
        .isFloat({ min: 0 })
        .withMessage('Max fee per gas must be positive'),
      
      body('maxPriorityFeePerGas')
        .optional()
        .isNumeric()
        .withMessage('Max priority fee per gas must be numeric')
        .isFloat({ min: 0 })
        .withMessage('Max priority fee per gas must be positive')
    ]
  }

  static validateOrderHash(): ValidationChain[] {
    return [
      param('orderHash')
        .isLength({ min: 64, max: 66 })
        .withMessage('Invalid order hash format')
        .matches(/^0x[a-fA-F0-9]{64}$/)
        .withMessage('Order hash must be a valid hex string')
    ]
  }

  static validateOrdersQuery(): ValidationChain[] {
    return [
      query('status')
        .optional()
        .isIn(['pending', 'locked', 'executed', 'cancelled'])
        .withMessage('Status must be one of: pending, locked, executed, cancelled'),
      
      query('direction')
        .optional()
        .isIn(['EthereumToPolkadot', 'PolkadotToEthereum'])
        .withMessage('Direction must be either EthereumToPolkadot or PolkadotToEthereum'),
      
      query('maker')
        .optional()
        .custom((value) => {
          if (isAddress(value)) return true
          
          if ((value.startsWith('1') || value.startsWith('5') || value.startsWith('15')) &&
              value.length >= 47 && value.length <= 48) {
            return true
          }
          
          throw new Error('Invalid wallet address format')
        }),
      
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative')
    ]
  }

  static validateCancelOrder(): ValidationChain[] {
    return [
      param('orderHash')
        .isLength({ min: 64, max: 66 })
        .withMessage('Invalid order hash format')
        .matches(/^0x[a-fA-F0-9]{64}$/)
        .withMessage('Order hash must be a valid hex string'),
      
      body('reason')
        .optional()
        .isString()
        .withMessage('Reason must be a string')
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
    ]
  }

  static validateTokenAddress(): ValidationChain {
    return body().custom((value, { req }) => {
      const { srcToken, dstToken, direction } = req.body as SwapBody
      
      if (!direction || !srcToken || !dstToken) {
        throw new Error('Missing required body parameters')
      }
      
      if (direction === 'EthereumToPolkadot') {
        if (srcToken !== 'ETH' && !isAddress(srcToken)) {
          throw new Error('Invalid Ethereum source token address')
        }
      }
      
      if (direction === 'PolkadotToEthereum') {
        if (dstToken !== 'ETH' && !isAddress(dstToken)) {
          throw new Error('Invalid Ethereum destination token address')
        }
      }
      
      if (srcToken === dstToken) {
        throw new Error('Source and destination tokens cannot be the same')
      }
      
      return true
    })
  }

  static validateSwapAmount(): ValidationChain {
    return body().custom((value, { req }) => {
      const { srcAmount, dstAmount } = req.body as SwapBody
      
      if (!srcAmount || !dstAmount) {
        throw new Error('Source and destination amounts are required')
      }
      
      const srcAmountNum = parseFloat(srcAmount)
      const dstAmountNum = parseFloat(dstAmount)
      
      if (isNaN(srcAmountNum) || isNaN(dstAmountNum)) {
        throw new Error('Invalid amount format')
      }
      
      const rate = dstAmountNum / srcAmountNum
      if (rate < 0.01 || rate > 100) {
        throw new Error('Exchange rate seems unreasonable. Please check amounts.')
      }
      
      const srcDecimals = (srcAmount.toString().split('.')[1] || '').length
      const dstDecimals = (dstAmount.toString().split('.')[1] || '').length
      
      if (srcDecimals > 18 || dstDecimals > 18) {
        throw new Error('Amounts cannot have more than 18 decimal places')
      }
      
      return true
    })
  }

  static validateDeadline(): ValidationChain {
    return body('deadline').custom((value, { req }) => {
      if (value) {
        const deadlineNum = parseInt(value)
        
        if (isNaN(deadlineNum)) {
          throw new Error('Deadline must be a valid number')
        }
        
        const now = Math.floor(Date.now() / 1000)
        
        if (deadlineNum <= now) {
          throw new Error('Deadline must be in the future')
        }
        
        if (deadlineNum > now + 86400) {
          throw new Error('Deadline cannot be more than 24 hours from now')
        }
        
        if (deadlineNum < now + 300) {
          throw new Error('Deadline must be at least 5 minutes from now')
        }
      }
      
      return true
    })
  }

  static sanitizeNumericInput(): ValidationChain {
    return body(['srcAmount', 'dstAmount', 'slippageTolerance'])
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.replace(/[^0-9.]/g, '')
        }
        return value
      })
  }

  static sanitizeAddresses(): ValidationChain {
    return body(['walletAddress', 'srcToken', 'dstToken'])
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.trim().toLowerCase()
        }
        return value
      })
  }

  static sanitizeOrderHash(): ValidationChain {
    return param('orderHash')
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`
        }
        return value
      })
  }

  static validateRateLimit(): ValidationChain {
    return body().custom((value, { req }) => {
      // FIX APPLIED HERE:
      // Use optional chaining `?.` to safely access a property that might
      // not exist on a potentially undefined `req.headers` object.
      const userAgent = req.headers?.['user-agent'];
      const ip = req.ip
      
      if (!userAgent || userAgent.length < 10) {
        throw new Error('Invalid user agent')
      }
      
      return true
    })
  }

  static validateSecurityHeaders(): ValidationChain {
    return body().custom((value, { req }) => {
      // FIX APPLIED HERE:
      // Use optional chaining `?.` for safe access.
      const origin = req.headers?.origin;
      const referer = req.headers?.referer;
      
      if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []
        if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
          throw new Error('Origin not allowed')
        }
      }
      
      return true
    })
  }
}