"""Small U-Net for 96 × 256 rectified ECG lead strips."""
import torch
from torch import nn
from torch.nn import functional as F


def block(channels: int, width: int) -> nn.Module:
    return nn.Sequential(nn.Conv2d(channels, width, 3, padding=1), nn.ReLU(),
                         nn.Conv2d(width, width, 3, padding=1), nn.ReLU())


class UNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.high = block(1, 16)
        self.low = block(16, 32)
        self.middle = block(32, 48)
        self.decode_low = block(80, 32)
        self.decode_high = block(48, 16)
        self.head = nn.Conv2d(16, 1, 1)

    @staticmethod
    def upsample(x: torch.Tensor) -> torch.Tensor:
        return F.interpolate(x, scale_factor=2, mode="nearest")

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        high = self.high(x)
        low = self.low(F.max_pool2d(high, 2))
        middle = self.middle(F.max_pool2d(low, 2))
        low_result = self.decode_low(torch.cat((low, self.upsample(middle)), dim=1))
        high_result = self.decode_high(torch.cat((high, self.upsample(low_result)), dim=1))
        return self.head(high_result)
