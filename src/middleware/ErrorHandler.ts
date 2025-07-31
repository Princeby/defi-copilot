// src/api/utils/ResponseFormatter.ts
import { Response } from 'express'

export interface ApiResponse<T> {
  success: boolean
  message: string
  data?: T
  error?: any
  timestamp: string
  meta?: {
    pagination?: {
      total: number
      limit: number
      offset: number
      hasMore: boolean
    }
    version?: string
    requestId?: string
  }
}

export class ResponseFormatter {
  
  /**
   * Send success response
   */
  static success<T>(
    res: Response, 
    message: string, 
    data?: T, 
    statusCode: number = 200,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      ...(meta && { meta })
    }
    
    return res.status(statusCode).json(response)
  }
  
  /**
   * Send error response
   */
  static error<T>(
    res: Response, 
    message: string, 
    error?: any, 
    statusCode: number = 500,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    const response: ApiResponse<T> = {
      success: false,
      message,
      error: ResponseFormatter.formatError(error),
      timestamp: new Date().toISOString(),
      ...(meta && { meta })
    }
    
    return res.status(statusCode).json(response)
  }
  
  /**
   * Send paginated response
   */
  static paginated<T>(
    res: Response,
    message: string,
    data: T[],
    pagination: {
      total: number
      limit: number
      offset: number
      hasMore: boolean
    },
    statusCode: number = 200
  ): Response<ApiResponse<T[]>> {
    return ResponseFormatter.success(
      res,
      message,
      data,
      statusCode,
      { pagination }
    )
  }
  
  /**
   * Send created response (201)
   */
  static created<T>(
    res: Response,
    message: string,
    data?: T,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.success(res, message, data, 201, meta)
  }
  
  /**
   * Send accepted response (202)
   */
  static accepted<T>(
    res: Response,
    message: string,
    data?: T,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.success(res, message, data, 202, meta)
  }
  
  /**
   * Send no content response (204)
   */
  static noContent(res: Response): Response {
    return res.status(204).send()
  }
  
  /**
   * Send bad request response (400)
   */
  static badRequest<T>(
    res: Response,
    message: string,
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 400, meta)
  }
  
  /**
   * Send unauthorized response (401)
   */
  static unauthorized<T>(
    res: Response,
    message: string = 'Authentication required',
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 401, meta)
  }
  
  /**
   * Send forbidden response (403)
   */
  static forbidden<T>(
    res: Response,
    message: string = 'Access forbidden',
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 403, meta)
  }
  
  /**
   * Send not found response (404)
   */
  static notFound<T>(
    res: Response,
    message: string = 'Resource not found',
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 404, meta)
  }
  
  /**
   * Send conflict response (409)
   */
  static conflict<T>(
    res: Response,
    message: string,
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 409, meta)
  }
  
  /**
   * Send unprocessable entity response (422)
   */
  static unprocessableEntity<T>(
    res: Response,
    message: string,
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 422, meta)
  }
  
  /**
   * Send too many requests response (429)
   */
  static tooManyRequests<T>(
    res: Response,
    message: string = 'Too many requests',
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 429, meta)
  }
  
  /**
   * Send internal server error response (500)
   */
  static internalServerError<T>(
    res: Response,
    message: string = 'Internal server error',
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 500, meta)
  }
  
  /**
   * Send service unavailable response (503)
   */
  static serviceUnavailable<T>(
    res: Response,
    message: string = 'Service unavailable',
    error?: any,
    meta?: ApiResponse<T>['meta']
  ): Response<ApiResponse<T>> {
    return ResponseFormatter.error(res, message, error, 503, meta)
  }
  
  /**
   * Format error object for response
   */
  private static formatError(error: any): any {
    if (!error) return null
    
    // If it's already a formatted error, return as is
    if (error.code && error.message) {
      return error
    }
    
    // If it's an Error object
    if (error instanceof Error) {
      return {
        message: error.message,
        name: error.name,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      }
    }
    
    // If it's an array (validation errors)
    if (Array.isArray(error)) {
      return error.map(err => ResponseFormatter.formatError(err))
    }
    
    // If it's a string
    if (typeof error === 'string') {
      return { message: error }
    }
    
    // Return as is for other types
    return error
  }
  
  /**
   * Create standardized swap response
   */
  static swapResponse<T>(
    res: Response,
    success: boolean,
    message: string,
    data?: T,
    statusCode?: number
  ): Response<ApiResponse<T>> {
    const meta = {
      version: '1.0.0',
      requestId: ResponseFormatter.generateRequestId()
    }
    
    if (success) {
      return ResponseFormatter.success(res, message, data, statusCode || 200, meta)
    } else {
      return ResponseFormatter.error(res, message, data, statusCode || 400, meta)
    }
  }
  
  /**
   * Create order status response
   */
  static orderStatusResponse(res: Response, order: any): Response<ApiResponse<any>> {
    const statusEmoji = {
      pending: '⏳',
      locked: '🔒',
      executed: '✅',
      cancelled: '❌'
    }
    
    const message = `${statusEmoji[order.status as keyof typeof statusEmoji] || '📋'} Order ${order.status}`
    
    return ResponseFormatter.success(res, message, order, 200, {
      version: '1.0.0',
      requestId: ResponseFormatter.generateRequestId()
    })
  }
  
  /**
   * Create health check response
   */
  static healthResponse(res: Response, healthData: any): Response<ApiResponse<any>> {
    const isHealthy = healthData.wallets?.ethereum?.connected && healthData.wallets?.polkadot?.connected
    const message = isHealthy ? '🟢 Service healthy' : '🔴 Service degraded'
    const statusCode = isHealthy ? 200 : 503
    
    return ResponseFormatter.success(res, message, healthData, statusCode, {
      version: '1.0.0'
    })
  }
  
  /**
   * Create quote response
   */
  static quoteResponse(res: Response, quote: any): Response<ApiResponse<any>> {
    const message = `💱 Quote generated for ${quote.srcAmount} ${quote.srcToken} → ${quote.estimatedDstAmount} ${quote.dstToken}`
    
    return ResponseFormatter.success(res, message, quote, 200, {
      version: '1.0.0',
      requestId: ResponseFormatter.generateRequestId()
    })
  }
  
  /**
   * Create balance response
   */
  static balanceResponse(res: Response, balances: any): Response<ApiResponse<any>> {
    const message = '💰 Balances retrieved successfully'
    
    return ResponseFormatter.success(res, message, balances, 200, {
      version: '1.0.0'
    })
  }
  
  /**
   * Generate unique request ID
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  /**
   * Middleware to add request ID to all responses
   */
  static addRequestId() {
    return (req: any, res: any, next: any) => {
      req.requestId = ResponseFormatter.generateRequestId()
      res.setHeader('X-Request-ID', req.requestId)
      next()
    }
  }
  
  /**
   * Create validation error response
   */
  static validationErrorResponse(res: Response, errors: any[]): Response<ApiResponse<null>> {
    const message = `❌ Validation failed with ${errors.length} error${errors.length > 1 ? 's' : ''}`
    
    return ResponseFormatter.badRequest(res, message, {
      validationErrors: errors,
      count: errors.length
    })
  }
}