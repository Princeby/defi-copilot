// src/api/validators/SwapValidation.ts
import { body, query, param, ValidationChain } from 'express-validator'
import { isAddress } from 'ethers'

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
          const direction = req.body.direction
          
          // For Ethereum addresses, validate with ethers
          if (direction === 'EthereumToPolkadot' && !isAddress(value)) {
            throw new Error('Invalid Ethereum wallet address')
          }
          
          // For Polkadot addresses, basic validation
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

      // Apply additional custom validations
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

      // Custom validation for token addresses in query
      query().custom((value, { req }) => {
        const { srcToken, dstToken, direction } = req.query
        
        // Validate Ethereum token addresses
        if (direction === 'EthereumToPolkadot') {
          if (srcToken !== 'ETH' && !isAddress(srcToken as string)) {
            throw new Error('Invalid Ethereum source token address')
          }
        }
        
        if (direction === 'PolkadotToEthereum') {
          if (dstToken !== 'ETH' && !isAddress(dstToken as string)) {
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
          // Check if it's a valid Ethereum address or Polkadot address
          if (isAddress(value)) return true
          
          // Basic Polkadot address validation
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

  // Custom validation helpers
  static validateTokenAddress(): ValidationChain {
    return body().custom((value, { req }) => {
      const { srcToken, dstToken, direction } = req.body
      
      // Validate Ethereum token addresses
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
      
      // Validate that source and destination tokens are different
      if (srcToken === dstToken) {
        throw new Error('Source and destination tokens cannot be the same')
      }
      
      return true
    })
  }

  static validateSwapAmount(): ValidationChain {
    return body().custom((value, { req }) => {
      const { srcAmount, dstAmount } = req.body
      
      const srcAmountNum = parseFloat(srcAmount)
      const dstAmountNum = parseFloat(dstAmount)
      
      // Check for reasonable exchange rate (prevent manipulation)
      const rate = dstAmountNum / srcAmountNum
      if (rate < 0.01 || rate > 100) {
        throw new Error('Exchange rate seems unreasonable. Please check amounts.')
      }
      
      // Validate precision (max 18 decimal places)
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
        const deadlineTimestamp = parseInt(value)
        const now = Math.floor(Date.now() / 1000)
        
        if (deadlineTimestamp <= now) {
          throw new Error('Deadline must be in the future')
        }
        
        // Max 24 hours from now
        if (deadlineTimestamp > now + 86400) {
          throw new Error('Deadline cannot be more than 24 hours from now')
        }
        
        // Min 5 minutes from now
        if (deadlineTimestamp < now + 300) {
          throw new Error('Deadline must be at least 5 minutes from now')
        }
      }
      
      return true
    })
  }

  // Sanitization helpers
  static sanitizeNumericInput(): ValidationChain {
    return body(['srcAmount', 'dstAmount', 'slippageTolerance'])
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          // Remove any non-numeric characters except decimal point
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
          // Ensure it starts with 0x
          return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`
        }
        return value
      })
  }

  // Rate limiting validation
  static validateRateLimit(): ValidationChain {
    return body().custom((value, { req }) => {
      // This would integrate with your rate limiting middleware
      // we'll do basic validation
      const userAgent = req.headers?.['user-agent']
      const ip = req.ip
      
      if (!userAgent || userAgent.length < 10) {
        throw new Error('Invalid user agent')
      }
      
      return true
    })
  }

  // Security validations
  static validateSecurityHeaders(): ValidationChain {
    return body().custom((value, { req }) => {
      // Check for required security headers
      const origin = req.headers.origin
      const referer = req.headers.referer
      
      // In production, you might want to validate allowed origins
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